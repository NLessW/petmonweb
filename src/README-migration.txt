This project had inline CSS and JS inside index.html. They have been moved:

CSS moved into css/styles.css:
- Admin toolbar layout (#admin-toolbar, #test-controls, admin buttons)
- Admin PIN modal styles (.pin-modal, .pin-content, .pin-keypad, etc.)
- Error screen typography and buttons (#error-screen, #call-support)
- Status host process layout (#status-host-process)
- Other previously inline layout rules

Inline scripts split into JS files:
- src/adminPin.js: PIN modal logic and window.requireAdminPin
- src/adminTriggers.js: hidden admin navigation trigger (PIN-gated)
- src/secretExit.js: secret exit button multi-click logic
- src/hotkeys.js: Ctrl+Alt+I hotkey for INI picker

index.html now references these via <script src> tags at the bottom.
