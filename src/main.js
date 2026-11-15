import {installDropdownClose} from './ui/controls.js';
import {initTheme} from './core/theme.js';
import {initHistory} from './core/history.js';
import {initShell} from './app.js';
import * as password from './features/password.js';
import * as table from './features/table.js';
import * as pick from './features/pick.js';
import * as roll from './features/roll.js';
import * as tools from './features/tools.js';

installDropdownClose();
const features=[password,table,pick,roll,tools].map(f=>f.init());
initHistory();
initShell();
initTheme();
features.forEach(f=>f.refresh());
