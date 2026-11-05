import "server-only";
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from "quickjs-emscripten-core";

let mod: Promise<QuickJSWASMModule> | undefined;

/** QuickJS on the server (validation). The browser loads the same engine and version from its browser build. */
export function getQuickJS(): Promise<QuickJSWASMModule> {
  mod ??= import("@jitl/quickjs-singlefile-mjs-release-sync").then((v) => newQuickJSWASMModuleFromVariant(v.default));
  return mod;
}
