// content/modules/ui-host.js — mount point helpers for in-page translation UI
(function (global) {
    function install(app) {
        app.ui = {
            root: null,
            shadow: null,
            btn: null,
            bubble: null,
        };

        function getMountPoint() {
            return document.documentElement || document.body;
        }

        function ensureUiRoot() {
            if (app.ui.shadow && app.ui.root) {
                if (!app.ui.root.isConnected) {
                    getMountPoint().appendChild(app.ui.root);
                }
                return app.ui.shadow;
            }

            const stale = document.getElementById(app.ROOT_ID);
            if (stale) {
                stale.remove();
            }

            const host = document.createElement("div");
            host.id = app.ROOT_ID;
            host.dataset.jytUi = "root";
            getMountPoint().appendChild(host);

            const shadow = host.attachShadow({ mode: "closed" });
            const style = document.createElement("style");
            style.textContent = app.CONTENT_UI_CSS || "";
            shadow.appendChild(style);

            app.ui.root = host;
            app.ui.shadow = shadow;
            app.ui.btn = null;
            app.ui.bubble = null;
            return shadow;
        }

        function getUiMount() {
            return ensureUiRoot();
        }

        function ensureUiHost() {
            return ensureUiRoot();
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

            const root = app.ui.root;
            const shadow = app.ui.shadow;
            if (!root) {
                return false;
            }

            return path.some((node) => {
                if (node === root) {
                    return true;
                }
                return (
                    shadow instanceof ShadowRoot &&
                    node instanceof Node &&
                    shadow.contains(node)
                );
            });
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
