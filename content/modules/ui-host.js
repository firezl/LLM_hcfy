// content/modules/ui-host.js — mount point helpers for in-page translation UI
(function (global) {
    function install(app) {
        app.ui = {
            btn: null,
            bubble: null,
        };

        function getUiMount() {
            return document.documentElement || document.body;
        }

        function ensureUiHost() {
            return app.ui;
        }

        function getTranslateBtn() {
            return app.ui.btn;
        }

        function getTranslateBubble() {
            return app.ui.bubble;
        }

        function isUiEventTarget(target) {
            if (!target) {
                return false;
            }

            const path =
                typeof target.composedPath === "function"
                    ? target.composedPath()
                    : [target];

            return path.some(
                (node) => node === app.ui.btn || node === app.ui.bubble,
            );
        }

        Object.assign(app, {
            ensureUiHost,
            getUiMount,
            getTranslateBtn,
            getTranslateBubble,
            isUiEventTarget,
        });
    }

    global.JYT_CS_UI_HOST = { install };
})(globalThis);
