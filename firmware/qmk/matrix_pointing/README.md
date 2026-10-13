# Matrix pointing — QMK 側の実装

Matrix エディタの「タッチパッド」「マウスレイヤー」「タイミング・ジェスチャー」「コンボ」「レイヤーの LED 色」画面から設定を読み書き・保存するための
QMK モジュールです。VIA のカスタム値（チャンネル 0）でエディタとやり取りし、設定は
EEPROM のユーザー用データブロックに保存します。プロトコルの詳細は
[`keyboards/matrix-split42/README.md`](../../../keyboards/matrix-split42/README.md) を参照してください。

> 確認済みの範囲: QMK `master`（2026-10-02 時点）の API 名・シグネチャと照合し、
> ホスト環境でのコンパイル確認と動作テスト（VIA 応答、保存、座標変換、オートマウス判定、
> 設定のバージョン 1→2 移行、タップ/ホールド判定、スワイプ）を実施済み。
> マルチタッチ版 QMK フォークでの Corne Procyon36 向けビルドも確認済み。**実機での動作は未確認**です。

## フォーク本体への追加パッチ（リビジョン 14）

[`../fork/0001-matrix-hires-scroll-and-sensor-tuning.patch`](../fork/0001-matrix-hires-scroll-and-sensor-tuning.patch)
をマルチタッチ版 QMK フォーク（george-norton/qmk_firmware `multitouch_experiment`）に当てると、
次が有効になります（当てなくてもビルドでき、その場合は機能が自動で無効になります）。

- **高解像度スクロールの有効化要求の受け付け**: パソコンが Resolution Multiplier の Feature
  レポートを書いたときだけ 1/120 目盛り単位で送ります（`usb_hires_scroll_enabled()`）。
  フォーク本体のままだとマウス用インターフェース宛ての要求を STALL するため、パソコンは
  有効化に失敗し、細かい単位が 1 目盛りとして扱われていました（r12 で約 120 倍速くなった原因）。
- **タッチセンサーの実行中の調整**: `maxtouch_tune()` で T100 のしきい値と移動ヒステリシスを
  書き換えます（エディタの「感度の詳細設定」）。

```sh
cd qmk_firmware   # multitouch_experiment
git apply /path/to/remap/firmware/qmk/fork/0001-matrix-hires-scroll-and-sensor-tuning.patch
```

## リビジョン 12〜14 の追加機能（任意）

`config.h` で有効にします（Corne Procyon36 の設定が実例です）。

```c
// 拡張領域（縁スライダー・ノブ・なめらか補間の設定）。設定 64 + コンボ 256 の後ろに 64 バイト
#define EECONFIG_USER_DATA_SIZE 384
#define EECONFIG_USER_DATA_VERSION 320           // 領域を広げても保存済みの設定・コンボを消さない
#define MATRIX_POINTING_EXT_EEPROM_OFFSET 320
#define MATRIX_POINTING_EDGE_ZONES               // タッチパッドの縁スライダー・四隅タップ（digitizer）
#define MATRIX_POINTING_KNOB_KEYS { {3, 2}, {7, 3} } // ノブの押し込みスイッチ {行, 列}（ENCODER_MAP_ENABLE 必須）
// 高解像度スクロール（1/120 目盛り）。上記のフォーク用パッチが必要（パッチなしでは目盛り単位で動作）
#define POINTING_DEVICE_HIRES_SCROLL_ENABLE
```

- **なめらか補間**（`MATRIX_POINTING_NATIVE_CPI` 使用時）: センサーの報告を次の報告までの
  時間に分けて 1ms ごとに送ります。加速は 1ms あたりの指の速度から決まる曲線です。
- **高解像度スクロール**（任意、上記の注意あり）: 2 本指スクロール・ホイールのキーコード（ノブ・縁スライダー・
  レイヤー上のマウスキー）を同じ経路で 1/120 目盛り単位で送ります。ホイールのキーコードは
  このモジュールが受け取るため、`process_record_user()` で
  `return matrix_pointing_process_record(keycode, record);` としてください。
- **慣性スクロール**（「慣性（グライド）」、0x03）: 2 本指で勢いよくスクロールして離すと
  減速しながら続きます（時定数 約 0.2 秒。高解像度スクロールなしでも目盛り単位で動作）。指の本数は `digitizer_task_user()`（このモジュールが定義）で取得し、
  分割キーボードではタッチパッド側から転送します。
- 初めてリビジョン 12 で起動したときに一度だけ、加速と慣性スクロールをオンにします。

## リビジョン 22: OS ごとの設定（任意）

Windows / Linux 用（PC）と Mac 用の 2 組を持ち、USB 接続時に QMK が判別した OS で切り替えます
（QMK の OS 判別機能 `OS_DETECTION_ENABLE`。QMK のドキュメントでは推定であり誤判定がありうるとされています）。
OS ごとに分かれるのは、タッチパッドの縁スライダー・四隅タップ、ノブの押し回し、3 本指スワイプのキーコードと、
Ctrl と GUI（Cmd / Win）の入れ替えです。キーマップは共通です。エディタの「固定」で常に PC / Mac にもできます。

```make
# rules.mk
OS_DETECTION_ENABLE = yes
```

```c
// config.h
#define MATRIX_POINTING_OS_PROFILES
// Mac 用の組を EEPROM の末尾 64 バイトに保存する。マクロ領域の末尾を 64 バイト縮めるだけで、
// キーマップの位置は変わらない（ファームウェアを更新してもキーマップは消えない）
#define DYNAMIC_KEYMAP_EEPROM_MAX_ADDR (TOTAL_EEPROM_BYTE_COUNT - 1 - 64)
```

- 分割キーボードでは USB 側の半分が判別し、使う組の縁スライダーの有無を反対側へ送ります。
- Ctrl と GUI の入れ替えは QMK の `keymap_config` を実行中だけ変えます（保存はしません）。
  このモジュールが入れ替えたときだけ戻すので、マジックキーでの入れ替えには影響しません。

## 組み込み手順（キーマップに追加する場合）

1. `matrix_pointing.c` と `matrix_pointing.h` をキーマップのフォルダにコピーします。
2. `rules.mk` に追加:

   ```make
   VIA_ENABLE = yes
   POINTING_DEVICE_ENABLE = yes
   SRC += matrix_pointing.c
   ```

3. `config.h` に追加:

   ```c
   #define EECONFIG_USER_DATA_SIZE 64        // 設定の保存領域（MATRIX_POINTING_EEPROM_SIZE 以上）
   #define POINTING_DEVICE_AUTO_MOUSE_ENABLE  // オートマウスレイヤー
   #define AUTO_MOUSE_DELAY 0                 // 「キー入力後の待機」はエディタの設定値で制御するため 0 に

   // タップ/ホールドキー（LT・MT）の判定時間とモードを画面から変更（任意）
   #define TAPPING_TERM_PER_KEY
   #define PERMISSIVE_HOLD_PER_KEY
   #define HOLD_ON_OTHER_KEY_PRESS_PER_KEY

   // Cirque タッチパッドで次の設定も画面から切り替えたい場合（任意）
   // #define POINTING_DEVICE_GESTURES_CURSOR_GLIDE_ENABLE  // 慣性（グライド）
   // #define CIRQUE_PINNACLE_TAP_ENABLE                    // タップでクリック（absolute モード時のみ有効）
   // #define CIRQUE_PINNACLE_CIRCULAR_SCROLL_ENABLE        // サークルスクロール
   ```

4. `keymap.c` に追加（既に同名の関数がある場合は、その中から呼び出してください）:

   ```c
   #include "matrix_pointing.h"

   void keyboard_post_init_user(void) {
       matrix_pointing_init();
   }

   report_mouse_t pointing_device_task_user(report_mouse_t mouse_report) {
       return matrix_pointing_task(mouse_report);
   }

   bool process_record_user(uint16_t keycode, keyrecord_t *record) {
       matrix_pointing_process_record(keycode, record);
       return true;
   }
   ```

5. ビルドして書き込み、Matrix で「タッチパッド」を開きます。対応済みなら
   「未対応」の案内が出ず、現在の設定値が表示されます。

### 既存のフックと衝突する場合

- キーボード側（`keyboard.c`）が既に `via_custom_value_command_kb()` を定義している:
  `#define MATRIX_POINTING_NO_VIA_HOOK` を付けたうえで、既存の関数内でチャンネル 0 の処理を
  このモジュールに委ねる必要があります（現状は関数を公開していないため、その場合はご相談ください）。
- キーマップが既に `is_mouse_record_user()` を定義している:
  `#define MATRIX_POINTING_NO_MOUSE_RECORD` を付け、既存の関数から
  `matrix_pointing_is_mouse_record(keycode, record)` を呼び出してください。
- EEPROM のユーザー領域を他でも使っている: `MATRIX_POINTING_EEPROM_OFFSET` で開始位置をずらし、
  `EECONFIG_USER_DATA_SIZE` を合計サイズ以上にしてください。

### 3 本指スワイプ（マルチタッチ版 QMK フォーク）

フォークの `digitizer_mouse_fallback.c` は `DIGITIZER_SWIPE_*_KC` を `tap_code()` に渡します。
次のように定義すると、画面で選んだキー（修飾キー付きの基本キーコード）が送られます。

```c
#define MATRIX_POINTING_SWIPE_KC(dir) ({ extern uint8_t matrix_pointing_swipe(uint8_t); matrix_pointing_swipe(dir); })
#define DIGITIZER_SWIPE_LEFT_KC MATRIX_POINTING_SWIPE_KC(0)
#define DIGITIZER_SWIPE_RIGHT_KC MATRIX_POINTING_SWIPE_KC(1)
#define DIGITIZER_SWIPE_UP_KC MATRIX_POINTING_SWIPE_KC(2)
#define DIGITIZER_SWIPE_DOWN_KC MATRIX_POINTING_SWIPE_KC(3)
```

### 分割キーボード（USB を挿していない側にタッチパッドがある場合）

タッチパッドのジェスチャー処理（タップ判定・スワイプ）は、タッチパッドが付いている側で動きます。
USB を反対側に挿すと、エディタからの設定は USB 側にしか届きません。次を定義すると、USB 側が設定を
相手側へ送り（変更時と 2 秒ごと）、相手側で検出したスワイプを受け取って入力します。

```c
#define MATRIX_POINTING_SPLIT_SYNC
#define SPLIT_TRANSACTION_IDS_USER MP_SYNC_CONFIG, MP_SYNC_SWIPE
#define RPC_M2S_BUFFER_SIZE 64
```

`housekeeping_task_user()` はこのモジュールが定義します（自分で定義している場合は
`MATRIX_POINTING_NO_HOUSEKEEPING` を付けて、その中から `matrix_pointing_housekeeping()` を呼んでください）。

### マルチタッチ版 QMK フォークでの移動量の取りこぼし対策

フォークの digitizer 処理はループ 1 周ごとにマウス報告を上書きしますが、ポインティング処理は 1ms に 1 回のため、
その間に読んだ移動量が失われます。このモジュールは `housekeeping_task_user()` で毎周の移動量を回収し、
`matrix_pointing_task()` で次の報告に加えます（`MATRIX_POINTING_NO_DRAIN` で無効化）。

### コンボ（EEPROM に保存）

`COMBO_ENABLE = yes` と次の設定で、エディタから最大 16 個のコンボを登録できます。`combo_count()` /
`combo_get()` をこのモジュールが定義するため、キーマップの `key_combos[]` は使われません（ビルドには空の定義が必要）。

```c
#define EECONFIG_USER_DATA_SIZE 320   // 設定 64 + コンボ 16 個 × 16
#define COMBO_ONLY_FROM_LAYER 0       // キー位置はレイヤー 0 のキーで判定
#define COMBO_TERM_PER_COMBO          // コンボごとの判定時間
#define COMBO_SHOULD_TRIGGER          // 有効なレイヤーの指定
```

### レイヤーの LED 色（RGB Matrix）

`RGB_MATRIX_ENABLE` があれば、`rgb_matrix_indicators_advanced_user()` で使用中のレイヤーの色に
全 LED を点灯します（色が「通常のライト効果」のレイヤーでは何もしません）。分割キーボードでは
`split.transport.sync.layer_state` と上記の分割同期が必要です。自分で同関数を定義している場合は
`MATRIX_POINTING_NO_LED_HOOK` を付けて `matrix_pointing_rgb_indicators()` を呼んでください。

### 設定の保存形式のバージョン

保存形式はバージョン 3 です（2: タイミングとスワイプ、3: レイヤーの LED 色を追加）。古いバージョンで
保存された設定は起動時にそのまま引き継ぎ、追加分は初期値で補います。なお
`EECONFIG_USER_DATA_SIZE` を変えると QMK がユーザー領域を初期化するため、その場合は初期値に戻ります。

## ブラウザからのファームウェア書き込み

このモジュールを組み込むと、Matrix の「ファームウェアを書き込む」で
「書き込みモードに切り替える」が使えるようになります（値 `0x7F` で `reset_keyboard()` を呼び、
RP2040 では BOOTSEL で再起動）。再起動は応答を返した約 100ms 後、`matrix_pointing_task()` の中で行います。

## ファームウェア更新時のキーマップ保持（リビジョン 21）

QMK の VIA は、保存データの有効判定にビルド日時を使うため、新しいビルドを書き込むたびに
キーマップとマクロを初期配置に戻していました（`quantum/via.c` の `via_eeprom_is_valid()` /
`eeconfig_init_via()`）。このモジュールは `via_init_kb()` を定義し、拡張ブロック（`'MZ'`）が
有効で、保存領域の構成（レイヤー数・マトリクス・マクロ数・エンコーダー数・ユーザー領域サイズ）が
同じビルドが書いたものであれば、VIA の有効判定を今のビルド用に書き直して初期化を防ぎます。

- リビジョン 12〜20 のブロック（バージョン 1〜6）には構成の識別値がありませんが、これらは
  すべて同じ構成（8 レイヤー、ユーザー領域 384 バイト）なので、そのまま保持します。
- 構成を変えたビルドでは識別値が一致しないため、従来どおり初期化されます。
- キーボード側で `via_init_kb()` を定義している場合は `MATRIX_POINTING_NO_VIA_INIT_KB` を定義し、
  その中から `matrix_pointing_keep_keymap()` を呼んでください。
- Matrix の書き込み画面は、開いた時点のキーマップをブラウザに保存し、再接続後にキーマップが
  違っていれば読み込みを案内します（古いファームウェアから更新する場合の保険）。

## 各設定の反映状況

| 設定                                                            | 反映方法                                                                | 備考                                                                                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 速度（CPI）                                                     | `pointing_device_set_cpi()`                                             | Dilemma 標準の DPI 変更キーを押すと、そちらの値で上書きされます（再起動で本設定に戻ります）      |
| 加速                                                            | 本モジュールで移動量を補正                                              | 速い移動ほど最大 3 倍                                                                            |
| 慣性（グライド）                                                | `cirque_pinnacle_enable_cursor_glide()`                                 | `POINTING_DEVICE_GESTURES_CURSOR_GLIDE_ENABLE` が必要                                            |
| 回転・X/Y 反転                                                  | 本モジュールで座標を変換                                                | 回転の向きは QMK の `POINTING_DEVICE_ROTATION_*` と同じ                                          |
| タップでクリック                                                | `cirque_pinnacle_enable_tap()`                                          | `CIRQUE_PINNACLE_TAP_ENABLE` と absolute モードが必要                                            |
| サークルスクロール                                              | `cirque_pinnacle_enable_circular_scroll()`                              | `CIRQUE_PINNACLE_CIRCULAR_SCROLL_ENABLE` が必要                                                  |
| スクロール速度・反転・横スクロール                              | 本モジュールでスクロール量を変換                                        | 速度は分周比 8 が元の速さ（4 で 2 倍、16 で半分）                                                |
| オートマウス 有効/対象レイヤー/解除時間/デバウンス              | QMK の `set_auto_mouse_*()`                                             |                                                                                                  |
| 起動する移動量・キー入力後の待機                                | `auto_mouse_activation()` を上書き                                      |                                                                                                  |
| マウス用以外のキーで即解除・修飾キー中は維持                    | `is_mouse_record_user()` で判定                                         |                                                                                                  |
| タップでクリック・タップ判定時間（マルチタッチ版 QMK フォーク） | `DIGITIZER_MOUSE_TAP_DETECTION_TIMEOUT` に `matrix_pointing_tap_term()` | オフのときは判定時間 0 を返し、タップを検出させない                                              |
| 2 本指タップ（右クリック）・タップ＆ドラッグ（同フォーク）      | `matrix_pointing_task()` でボタンを除去                                 | ドラッグは 80ms 以上押され続けたボタン 1 として判定                                              |
| 上記以外（Cirque の 2 本指/端スクロール、センサー感度など）     | **保存のみ**                                                            | 値 `0x7E` で「反映しない」と通知し、エディタに「このキーボードでは反映されません」と表示されます |
| 長押し判定時間・ホールド判定モード                              | `get_tapping_term()` などを定義                                         | `TAPPING_TERM_PER_KEY` / `PERMISSIVE_HOLD_PER_KEY` / `HOLD_ON_OTHER_KEY_PRESS_PER_KEY` が必要    |
| 3 本指スワイプのキー                                            | `matrix_pointing_swipe()`                                               | マルチタッチ版 QMK フォークのみ。修飾キー付きの基本キーコードのみ送信                            |
