/* eslint-disable no-undef */
import React, { useEffect, useState } from 'react';
import './Configure.scss';
import {
  OptionsObject,
  ProviderContext,
  SnackbarKey,
  withSnackbar,
} from 'notistack';
import Header from './header/Header.container';
import Content from './content/Content.container';
import {
  ConfigureActionsType,
  ConfigureStateType,
} from './Configure.container';
import { NotificationItem } from '../../actions/actions';
import { IKeyboard } from '../../services/hid/Hid';
import LicenseLink from '../common/license/LicenseLink';
import './Responsive.scss';
import { Button, CssBaseline } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { APPLICATION_NAME } from '../../utils/Brand';
import FirmwareFlasherDialog from './firmware/FirmwareFlasherDialog';
import { useUiLayout } from '../../services/ui/UiLayout';
import { SetupPhase } from '../../store/state';

type OwnProps = {};
type ConfigureProps = OwnProps &
  Partial<ConfigureStateType> &
  Partial<ConfigureActionsType> &
  ProviderContext;

function Configure(props: ConfigureProps) {
  const [displayedNotificationIds, setDisplayedNotificationIds] = useState<
    string[]
  >([]);
  const [supportedBrowser, setSupportedBrowser] = useState<boolean>(true);
  // The new layout draws its own header (see Content).
  const shell =
    useUiLayout() === 'shell' && props.setupPhase === SetupPhase.openedKeyboard;

  const storeDisplayedNotification = (key: string) => {
    setDisplayedNotificationIds([...displayedNotificationIds, key]);
  };

  const removeDisplayedNotification = (key: string) => {
    setDisplayedNotificationIds([
      ...displayedNotificationIds.filter((k) => key !== k),
    ]);
  };

  const updateNotifications = () => {
    props.notifications!.forEach((item: NotificationItem) => {
      if (displayedNotificationIds.includes(item.key)) return;

      const snackbarOptions: OptionsObject = {
        key: item.key,
        variant: item.type,
        onExited: (event, key: React.ReactText) => {
          props.removeNotification!(key as string);
          removeDisplayedNotification(key as string);
        },
        // eslint-disable-next-line react/display-name
        action: (key: SnackbarKey) => (
          <Button
            onClick={() => {
              props.closeSnackbar(key);
            }}
          >
            <CloseIcon />
          </Button>
        ),
      };

      if (item.type === 'success' || item.type === 'info') {
        snackbarOptions.autoHideDuration = 3000;
        snackbarOptions.persist = false;
      } else {
        snackbarOptions.persist = true;
      }

      props.enqueueSnackbar(item.message, snackbarOptions);
      storeDisplayedNotification(item.key);
    });
  };

  const updateTitle = () => {
    const hasKeysToFlush = props.remaps!.reduce((has, v) => {
      return 0 < Object.values(v).length || has;
    }, false);
    const title = hasKeysToFlush ? `*${APPLICATION_NAME}` : APPLICATION_NAME;
    props.updateTitle!(title);
  };

  const initKeyboardConnectionEventHandler = () => {
    props.hid!.instance.setConnectionEventHandler({
      connect: (connectedKeyboard: IKeyboard) => {
        props.onConnectKeyboard!(connectedKeyboard);
      },
      disconnect: (disconnectedKeyboard: IKeyboard) => {
        props.onDisconnectKeyboard!(disconnectedKeyboard, props.keyboard!);
      },
      close: (keyboard: IKeyboard) => {
        props.onCloseKeyboard!(keyboard);
      },
    });
  };

  useEffect(() => {
    props.initializeMeta!();
    if ((navigator as any).hid === undefined) {
      setSupportedBrowser(false);
      return;
    }
    props.initAppPackage!(APPLICATION_NAME, String(props.buildNumber!));

    if (props.auth) {
      props.auth.subscribeAuthStatus((user) => {
        props.updateSignedIn!(!!user);
      });
    }

    updateTitle();
    updateNotifications();
    initKeyboardConnectionEventHandler();
    props.updateAuthorizedKeyboardList!();
  }, []);

  useEffect(() => {
    updateTitle();
    updateNotifications();

    if (props.testMatrix) {
      // Ignore all key event when TEST MATRIX MODE
      window.onkeydown = (e: any) => {
        e.preventDefault();
      };
      window.onkeyup = (e: any) => {
        e.preventDefault();
      };
    } else {
      window.onkeydown = null;
      window.onkeyup = null;
    }
  });

  if (!supportedBrowser) {
    return (
      <React.Fragment>
        <CssBaseline />

        <Header />
        <main>
          <UnsupportedBrowser />
        </main>
        <LicenseLink className="license-link-corner" />
        <FirmwareFlasherDialog />
      </React.Fragment>
    );
  }
  return (
    <React.Fragment>
      <div className="configure-root">
        <CssBaseline />
        {!shell && <Header />}
        <main>
          <Content />
        </main>
        {!shell && (props.draggingKey || props.testMatrix) && (
          <div className="dragMask fill-blank"></div>
        )}
        {!props.keyboard && <LicenseLink className="license-link-corner" />}
        <FirmwareFlasherDialog />
      </div>
    </React.Fragment>
  );
}

export default withSnackbar(Configure);

function UnsupportedBrowser() {
  return (
    <div className="message-box-wrapper">
      <div className="message-box">
        <h1>Unsupported Web Browser</h1>
        <p>
          {APPLICATION_NAME} works on web browsers that support the{' '}
          <a href="https://wicg.github.io/webhid/">WebHID API</a>, such as{' '}
          <a href="https://www.google.com/chrome">Google Chrome</a> or Microsoft
          Edge version 89 or later on a desktop computer.
        </p>
      </div>
    </div>
  );
}
