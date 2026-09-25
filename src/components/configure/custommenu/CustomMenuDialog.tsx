import React, { useEffect, useMemo, useRef, useState } from 'react';
import './CustomMenuDialog.scss';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  PaperProps,
  Select,
  Slider,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import Draggable from 'react-draggable';
import { t } from 'i18next';
import { IKeyboard } from '../../../services/hid/Hid';
import {
  collectValueControls,
  decodeLabelValue,
  decodeRangeValue,
  encodeRangeValue,
  encodeToggleValue,
  evaluateShowIf,
  getButtonValue,
  getDropdownOptions,
  getRangeBounds,
  ICustomMenu,
  ICustomMenuControl,
  ICustomMenuNode,
  ICustomMenuValues,
  isToggleOn,
  resolveNumericValues,
  shiftFrom16Bit,
  shiftTo16Bit,
} from '../../../services/hid/CustomMenu';

type CustomMenuDialogProps = {
  open: boolean;
  onClose: () => void;
  keyboard: IKeyboard;
  menus: ICustomMenu[];
  // eslint-disable-next-line no-unused-vars
  onError: (message: string) => void;
};

const toHex16 = (value: number): string =>
  `0x${value.toString(16).toUpperCase().padStart(4, '0')}`;

export default function CustomMenuDialog(props: CustomMenuDialogProps) {
  const { open, keyboard, menus } = props;
  const [values, setValues] = useState<ICustomMenuValues>({});
  const [unhandledKeys, setUnhandledKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedMenuIndex, setSelectedMenuIndex] = useState<number>(0);
  const [keycodeTexts, setKeycodeTexts] = useState<{
    [valueKey: string]: string;
  }>({});

  const controls = useMemo(() => collectValueControls(menus), [menus]);
  // Keep the latest callback without re-triggering the loading effect.
  const onErrorRef = useRef(props.onError);
  onErrorRef.current = props.onError;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const loadedValues: ICustomMenuValues = {};
      const unhandled = new Set<string>();
      for (const control of controls) {
        const result = await keyboard.fetchCustomMenuValue(
          control.commandBytes
        );
        if (cancelled) return;
        if (result.unhandled) {
          unhandled.add(control.valueKey!);
        } else if (result.success) {
          loadedValues[control.valueKey!] = result.value!;
        } else {
          console.error(result.cause);
          onErrorRef.current(
            t('Reading the keyboard settings failed.') + ` (${control.label})`
          );
          break;
        }
      }
      setValues(loadedValues);
      setUnhandledKeys(unhandled);
      setKeycodeTexts({});
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, keyboard, controls]);

  const numericValues = resolveNumericValues(controls, values);
  const visibleMenus = menus
    .map((menu, index) => ({ menu, index }))
    .filter(({ menu }) => evaluateShowIf(menu.showIf, numericValues));
  const selected =
    visibleMenus.find(({ index }) => index === selectedMenuIndex) ??
    visibleMenus[0];

  const updateLocalValue = (control: ICustomMenuControl, bytes: number[]) => {
    setValues((prev) => ({ ...prev, [control.valueKey!]: bytes }));
  };

  const sendValue = async (control: ICustomMenuControl, bytes: number[]) => {
    if (control.type !== 'button') {
      updateLocalValue(control, bytes);
    }
    const updateResult = await keyboard.updateCustomMenuValue(
      control.commandBytes,
      bytes
    );
    if (!updateResult.success) {
      if (updateResult.unhandled) {
        setUnhandledKeys((prev) => new Set(prev).add(control.valueKey!));
        return;
      }
      console.error(updateResult.cause);
      onErrorRef.current(
        t('Updating the keyboard setting failed.') + ` (${control.label})`
      );
      return;
    }
    // Persist the value into EEPROM. The channel id is the first byte.
    const saveResult = await keyboard.saveCustomMenu(control.commandBytes[0]);
    if (!saveResult.success && !saveResult.unhandled) {
      console.error(saveResult.cause);
      onErrorRef.current(
        t('Saving the keyboard setting failed.') + ` (${control.label})`
      );
    }
  };

  const renderControl = (control: ICustomMenuControl): React.ReactNode => {
    if (control.type === 'label' && control.commandBytes.length === 0) {
      return <Typography variant="body2">{t(control.text ?? '')}</Typography>;
    }
    if (control.valueKey && unhandledKeys.has(control.valueKey)) {
      return (
        <Typography variant="caption" color="text.secondary">
          {t('Not supported by the keyboard firmware')}
        </Typography>
      );
    }
    const bytes = values[control.valueKey!] ?? [];
    switch (control.type) {
      case 'range': {
        const { min, max } = getRangeBounds(control);
        return (
          <Slider
            size="small"
            min={min}
            max={max}
            value={decodeRangeValue(control, bytes)}
            valueLabelDisplay="auto"
            onChange={(_event, value) => {
              updateLocalValue(
                control,
                encodeRangeValue(control, value as number)
              );
            }}
            onChangeCommitted={(_event, value) => {
              sendValue(control, encodeRangeValue(control, value as number));
            }}
          />
        );
      }
      case 'dropdown': {
        const options = getDropdownOptions(control);
        const current = options.find((option) => option.value === bytes[0]);
        return (
          <Select
            size="small"
            fullWidth
            value={current ? current.value : ''}
            onChange={(event) => {
              sendValue(control, [Number(event.target.value)]);
            }}
          >
            {options.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {t(option.label)}
              </MenuItem>
            ))}
          </Select>
        );
      }
      case 'toggle':
        return (
          <Switch
            checked={isToggleOn(control, bytes)}
            onChange={(event) => {
              sendValue(
                control,
                encodeToggleValue(control, event.target.checked)
              );
            }}
          />
        );
      case 'color': {
        const hue = bytes[0] ?? 0;
        const sat = bytes[1] ?? 0;
        const swatch = `hsl(${Math.round((hue * 360) / 255)}, ${Math.round(
          (sat * 100) / 255
        )}%, 50%)`;
        return (
          <Box className="custom-menu-color">
            <Box
              className="custom-menu-color-swatch"
              sx={{ bgcolor: swatch }}
            />
            <Box className="custom-menu-color-sliders">
              <Typography variant="caption">{t('Hue')}</Typography>
              <Slider
                size="small"
                min={0}
                max={255}
                value={hue}
                onChange={(_event, value) =>
                  updateLocalValue(control, [value as number, sat])
                }
                onChangeCommitted={(_event, value) =>
                  sendValue(control, [value as number, sat])
                }
              />
              <Typography variant="caption">{t('Saturation')}</Typography>
              <Slider
                size="small"
                min={0}
                max={255}
                value={sat}
                onChange={(_event, value) =>
                  updateLocalValue(control, [hue, value as number])
                }
                onChangeCommitted={(_event, value) =>
                  sendValue(control, [hue, value as number])
                }
              />
            </Box>
          </Box>
        );
      }
      case 'keycode': {
        const valueKey = control.valueKey!;
        const code = shiftTo16Bit(bytes[0] ?? 0, bytes[1] ?? 0);
        const text = keycodeTexts[valueKey] ?? toHex16(code);
        const isValid = /^(0x)?[0-9a-fA-F]{1,4}$/.test(text.trim());
        const commit = () => {
          if (!isValid) return;
          const newCode = parseInt(text.trim().replace(/^0x/, ''), 16);
          setKeycodeTexts((prev) => {
            const next = { ...prev };
            delete next[valueKey];
            return next;
          });
          if (newCode !== code) {
            sendValue(control, shiftFrom16Bit(newCode));
          }
        };
        return (
          <TextField
            size="small"
            value={text}
            error={!isValid}
            helperText={isValid ? '' : t('Enter a hexadecimal keycode')}
            onChange={(event) =>
              setKeycodeTexts((prev) => ({
                ...prev,
                [valueKey]: event.target.value,
              }))
            }
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit();
            }}
          />
        );
      }
      case 'button':
        return (
          <Button
            size="small"
            variant="outlined"
            onClick={() => sendValue(control, getButtonValue(control))}
          >
            {t('Execute')}
          </Button>
        );
      case 'label':
        return (
          <Typography variant="body2">{decodeLabelValue(bytes)}</Typography>
        );
    }
    return null;
  };

  const renderNodes = (
    nodes: ICustomMenuNode[],
    path: string
  ): React.ReactNode =>
    nodes.map((node, index) => {
      const key = `${path}-${index}`;
      if (!evaluateShowIf(node.showIf, numericValues)) return null;
      if (node.kind === 'group') {
        return (
          <div key={key} className="custom-menu-group">
            {node.label && (
              <Typography
                variant="subtitle2"
                className="custom-menu-group-label"
              >
                {t(node.label)}
              </Typography>
            )}
            {renderNodes(node.content, key)}
          </div>
        );
      }
      return (
        <div key={key} className="custom-menu-row">
          <div className="custom-menu-row-label">
            <Typography variant="body2">{t(node.label)}</Typography>
          </div>
          <div className="custom-menu-row-control">{renderControl(node)}</div>
        </div>
      );
    });

  return (
    <Dialog
      open={open}
      maxWidth="sm"
      fullWidth
      PaperComponent={PaperComponent}
      className="custom-menu-dialog"
    >
      <DialogTitle id="custom-menu-dialog-title" style={{ cursor: 'move' }}>
        {t('Keyboard Settings')}
        <div className="close-dialog">
          <CloseIcon onClick={props.onClose} />
        </div>
      </DialogTitle>
      <DialogContent dividers className="custom-menu-dialog-content">
        {loading ? (
          <div className="custom-menu-loading">
            <CircularProgress size={32} />
          </div>
        ) : selected === undefined ? (
          <Typography variant="body2" color="text.secondary">
            {t('No settings are available.')}
          </Typography>
        ) : (
          <>
            {visibleMenus.length > 1 && (
              <Tabs
                value={selected.index}
                onChange={(_event, value: number) =>
                  setSelectedMenuIndex(value)
                }
                variant="scrollable"
                scrollButtons="auto"
              >
                {visibleMenus.map(({ menu, index }) => (
                  <Tab key={index} value={index} label={t(menu.label)} />
                ))}
              </Tabs>
            )}
            <div className="custom-menu-content">
              {renderNodes(selected.menu.content, `${selected.index}`)}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PaperComponent(props: PaperProps) {
  return (
    <Draggable
      handle="#custom-menu-dialog-title"
      cancel={'[class*="MuiDialogContent-root"]'}
    >
      <Paper {...props} />
    </Draggable>
  );
}
