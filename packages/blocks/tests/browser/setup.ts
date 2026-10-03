import "../../src/site.css";

import { defaultTheme, resolveTheme, themeCss } from "@repo/tokens";

// The default theme's variables, as a site's page inlines its own.
const theme = document.createElement("style");
theme.textContent = themeCss(resolveTheme(defaultTheme).theme);
document.head.append(theme);
