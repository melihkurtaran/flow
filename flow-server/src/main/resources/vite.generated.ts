/**
 * NOTICE: this is an auto-generated file
 *
 * This file has been generated by the `flow:prepare-frontend` maven goal.
 * This file will be overwritten on every run. Any custom changes should be made to vite.config.ts
 */
import path from 'path';
import {readFileSync} from 'fs';
import * as net from 'net';

import {processThemeResources} from '@vaadin/application-theme-plugin/theme-handle.js';
import settings from '#settingsImport#';
import {defineConfig, mergeConfig, PluginOption, ResolvedConfig, UserConfigFn} from 'vite';
import {injectManifest} from 'workbox-build';

import * as rollup from 'rollup';
import brotli from 'rollup-plugin-brotli';
import replace from '@rollup/plugin-replace';
import checker from 'vite-plugin-checker';

const appShellUrl = '.';

const frontendFolder = path.resolve(__dirname, settings.frontendFolder);
const themeFolder = path.resolve(frontendFolder, settings.themeFolder);
const frontendBundleFolder = path.resolve(__dirname, settings.frontendBundleOutput);
const addonFrontendFolder = path.resolve(__dirname, settings.addonFrontendFolder);

const projectStaticAssetsFolders = [
  path.resolve(__dirname, 'src', 'main', 'resources', 'META-INF', 'resources'),
  path.resolve(__dirname, 'src', 'main', 'resources', 'static'),
  frontendFolder
];

// Folders in the project which can contain application themes
const themeProjectFolders = projectStaticAssetsFolders.map((folder) => path.resolve(folder, settings.themeFolder));

const themeOptions = {
  devMode: false,
  // The following matches folder 'target/flow-frontend/themes/'
  // (not 'frontend/themes') for theme in JAR that is copied there
  themeResourceFolder: path.resolve(__dirname, settings.themeResourceFolder),
  themeProjectFolders: themeProjectFolders,
  projectStaticAssetsOutputFolder: path.resolve(__dirname, settings.staticOutput),
  frontendGeneratedFolder: path.resolve(frontendFolder, settings.generatedFolder)
};

// Block debug and trace logs.
console.trace = () => {};
console.debug = () => {};

function buildSWPlugin(): PluginOption {
  let config: ResolvedConfig;

  return {
    name: 'vaadin:build-sw',
    enforce: 'post',
    async configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    async buildStart() {
      const includedPluginNames = [
        'alias',
        'vite:resolve',
        'vite:esbuild',
        'rollup-plugin-dynamic-import-variables',
        'vite:esbuild-transpile',
        'vite:terser',
      ]
      const rollupPlugins: rollup.Plugin[] = config.plugins.filter((p) => {
        return includedPluginNames.includes(p.name)
      });
      rollupPlugins.push(
        replace({
          'process.env.NODE_ENV': JSON.stringify(config.mode),
          ...config.define,
        })
      );

      const rollupOutput: rollup.OutputOptions = {
        file: path.resolve(frontendBundleFolder, 'sw.js'),
        format: 'es',
        exports: 'none',
        sourcemap: config.command === 'serve' || config.build.sourcemap,
        inlineDynamicImports: true,
      }

      const rollupConfig: rollup.RollupOptions = {
        input: path.resolve(settings.clientServiceWorkerSource),
        output: rollupOutput,
        plugins: rollupPlugins,
      }

      const bundle = await rollup.rollup(rollupConfig);
      try {
        await bundle.write(rollupOutput);
      } finally {
        await bundle.close();
      }
    },
  }
}

function injectManifestToSWPlugin(): PluginOption {
  const rewriteManifestIndexHtmlUrl = (manifest) => {
    const indexEntry = manifest.find((entry) => entry.url === 'index.html');
    if (indexEntry) {
      indexEntry.url = appShellUrl;
    }

    return { manifest, warnings: [] };
  }

  return {
    name: 'vaadin:inject-manifest-to-sw',
    enforce: 'post',
    apply: 'build',
    async closeBundle() {
      await injectManifest({
        swSrc: path.resolve(frontendBundleFolder, 'sw.js'),
        swDest: path.resolve(frontendBundleFolder, 'sw.js'),
        globDirectory: frontendBundleFolder,
        globPatterns: ['**/*'],
        globIgnores: ['**/*.br'],
        injectionPoint: 'self.__WB_MANIFEST',
        manifestTransforms: [rewriteManifestIndexHtmlUrl],
        maximumFileSizeToCacheInBytes: 100 * 1024 * 1024 // 100mb,
      });
    }
  }
}

function vaadinBundlesPlugin(): PluginOption {
  type ExportInfo = string | {
    namespace?: string,
    source: string,
  };

  type ExposeInfo = {
    exports: ExportInfo[],
  };

  type PackageInfo = {
    version: string,
    exposes: Record<string, ExposeInfo>,
  };

  type BundleJson = {
    packages: Record<string, PackageInfo>,
  };

  const disabledMessage = 'Vaadin component dependency bundles are disabled.'

  const modulesDirectory = path.posix.resolve(__dirname, 'node_modules');

  let vaadinBundleJson: BundleJson;

  function parseModuleId(id: string): { packageName: string, modulePath: string } {
    const [scope, scopedPackageName] = id.split('/', 3);
    const packageName = scope.startsWith('@') ? `${scope}/${scopedPackageName}` : scope;
    const modulePath = `.${id.substring(packageName.length)}`;
    return {
      packageName,
      modulePath
    };
  }

  function getExports(id: string): string[] | undefined {
    const {
      packageName,
      modulePath
    } = parseModuleId(id);
    const packageInfo = vaadinBundleJson.packages[packageName];

    if (!packageInfo) return;

    const exposeInfo: ExposeInfo = packageInfo.exposes[modulePath];
    if (!exposeInfo) return;

    const exportsSet = new Set<string>();
    for (const e of exposeInfo.exports) {
      if (typeof e === 'string') {
        exportsSet.add(e);
      } else {
        const {namespace, source} = e;
        if (namespace) {
          exportsSet.add(namespace);
        } else {
          const sourceExports = getExports(source);
          if (sourceExports) {
            sourceExports.forEach((e) => exportsSet.add(e));
          }
        }
      }
    }
    return Array.from(exportsSet);
  }

  return {
    name: 'vaadin:bundles',
    enforce: 'pre',
    apply(config, {command}) {
      if (command !== "serve") return false;

      try {
        const vaadinBundleJsonPath = require.resolve('@vaadin/bundles/vaadin-bundle.json');
        vaadinBundleJson = JSON.parse(readFileSync(vaadinBundleJsonPath, {encoding: 'utf8'}));
      } catch (e: unknown) {
        if (typeof e === 'object' && (e as {code: string}).code === 'MODULE_NOT_FOUND') {
          vaadinBundleJson = {packages: {}};
          console.info(`@vaadin/bundles npm package is not found, ${disabledMessage}`);
          return false;
        } else {
          throw e;
        }
      }

      const versionMismatches: Array<{name: string, bundledVersion: string, installedVersion: string}> = [];
      for (const [name, packageInfo] of Object.entries(vaadinBundleJson.packages)) {
        let installedVersion: string | undefined = undefined;
        try {
          const { version: bundledVersion } = packageInfo;
          const installedPackageJsonFile = path.resolve(modulesDirectory, name, 'package.json');
          const packageJson = JSON.parse(readFileSync(installedPackageJsonFile, {encoding: 'utf8'}));
          installedVersion = packageJson.version;
          if (installedVersion && installedVersion !== bundledVersion) {
            versionMismatches.push({
              name,
              bundledVersion,
              installedVersion
            });
          }
        } catch (_) {
          // ignore package not found
        }
      }
      if (versionMismatches.length) {
        console.info(`@vaadin/bundles has version mismatches with installed packages, ${disabledMessage}`);
        console.info(`Packages with version mismatches: ${JSON.stringify(versionMismatches, undefined, 2)}`);
        vaadinBundleJson = {packages: {}};
        return false;
      }

      return true;
    },
    async config(config) {
      return mergeConfig({
        optimizeDeps: {
          exclude: [
            // Vaadin bundle
            '@vaadin/bundles',
            ...Object.keys(vaadinBundleJson.packages)
          ]
        }
      }, config);
    },
    load(rawId) {
      const [path, params] = rawId.split('?');
      if (!path.startsWith(modulesDirectory)) return;

      const id = path.substring(modulesDirectory.length + 1);
      const exports = getExports(id);
      if (exports === undefined) return;

      const cacheSuffix = params ? `?${params}` : '';
      const bundlePath = `@vaadin/bundles/vaadin.js${cacheSuffix}`;

      return `import { init as VaadinBundleInit, get as VaadinBundleGet } from '${bundlePath}';
await VaadinBundleInit('default');
const { ${exports.join(', ')} } = (await VaadinBundleGet('./node_modules/${id}'))();
export { ${exports.map((binding) => `${binding} as ${binding}`).join(', ')} };`;
    }
  }
}

function updateTheme(contextPath: string) {
  const themePath = path.resolve(themeFolder);
  if (contextPath.startsWith(themePath)) {
    const changed = path.relative(themePath, contextPath);

    console.debug('Theme file changed', changed);

    if (changed.startsWith(settings.themeName)) {
      processThemeResources(themeOptions, console);
    }
  }
}

function runWatchDog(watchDogPort) {
  const client = net.Socket();
  client.setEncoding('utf8');
  client.on('error', function () {
    console.log('Watchdog connection error. Terminating vite process...');
    client.destroy();
    process.exit(0);
  });
  client.on('close', function () {
    client.destroy();
    runWatchDog(watchDogPort);
  });

  client.connect(watchDogPort, 'localhost');
}

let spaMiddlewareForceRemoved = false;

const allowedFrontendFolders = [
  frontendFolder,
  addonFrontendFolder,
  path.resolve(addonFrontendFolder, '..', 'frontend'), // Contains only generated-flow-imports
  path.resolve(frontendFolder, '../node_modules')
];

export const vaadinConfig: UserConfigFn = (env) => {
  const devMode = env.mode === 'development';

  if (devMode && process.env.watchDogPort) {
    // Open a connection with the Java dev-mode handler in order to finish
    // vite when it exits or crashes.
    runWatchDog(process.env.watchDogPort);
  }
  return {
    root: 'frontend',
    base: '',
    resolve: {
      alias: {
        themes: themeFolder,
        Frontend: frontendFolder
      },
      preserveSymlinks: true,
    },
    define: {
      OFFLINE_PATH: settings.offlinePath,
      VITE_ENABLED: 'true'
    },
    server: {
      fs: {
        allow: allowedFrontendFolders,
      }
    },
    optimizeDeps: {
      entries: [
        // Pre-scan entrypoints in Vite to avoid reloading on first open
        'generated/vaadin.ts'
      ]
    },
    build: {
      outDir: frontendBundleFolder,
      assetsDir: 'VAADIN/build',
      rollupOptions: {
        input: {
          indexhtml: path.resolve(frontendFolder, 'index.html')
        }
      }
    },
    optimizeDeps: {
      entries: [
        // Pre-scan entrypoints in Vite to avoid reloading on first open
        'generated/vaadin.ts'
      ],
      exclude: [
        '@vaadin/router'
      ]
    },
    plugins: [
      !devMode && brotli(),
      devMode && vaadinBundlesPlugin(),
      settings.offlineEnabled && buildSWPlugin(),
      settings.offlineEnabled && injectManifestToSWPlugin(),
      {
        name: 'vaadin:custom-theme',
        config() {
          processThemeResources(themeOptions, console);
        },
        handleHotUpdate(context) {
          updateTheme(path.resolve(context.file));
        }
      },
      {
        name: 'vaadin:force-remove-spa-middleware',
        transformIndexHtml: {
          enforce: 'pre',
          transform(_html, { server }) {
            if (server && !spaMiddlewareForceRemoved) {
              server.middlewares.stack = server.middlewares.stack.filter((mw) => {
                const handleName = '' + mw.handle;
                return !handleName.includes('viteSpaFallbackMiddleware');
              });
              spaMiddlewareForceRemoved = true;
            }
          }
        }
      },
      {
        name: 'vaadin:inject-entrypoint-script',
        transformIndexHtml: {
          enforce: 'pre',
          transform(_html, { path, server }) {
            if (path !== '/index.html') {
              return;
            }

            if (devMode) {
              const basePath = server?.config.base ?? '';
              return [
                {
                  tag: 'script',
                  attrs: { type: 'module', src: `${basePath}generated/vite-devmode.ts` },
                  injectTo: 'head',
                },
                {
                  tag: 'script',
                  attrs: { type: 'module', src: `${basePath}generated/vaadin.ts` },
                  injectTo: 'head',
                }
              ]
            }

            return [
              {
                tag: 'script',
                attrs: { type: 'module', src: './generated/vaadin.ts' },
                injectTo: 'head',
              }
            ]
          },
        },
      },
      checker({
        typescript: true
      })
    ]
  };
};

export const overrideVaadinConfig = (customConfig: UserConfigFn) => {
  return defineConfig((env) => mergeConfig(vaadinConfig(env), customConfig(env)));
};
