"use strict";
(globalThis["webpackChunk"] = globalThis["webpackChunk"] || []).push([[5457],{

/***/ 95457:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  "default": () => (/* binding */ longitudinal_src),
  extensionDependencies: () => (/* binding */ extensionDependencies),
  initToolGroups: () => (/* reexport */ src.initToolGroups),
  longitudinalInstance: () => (/* binding */ longitudinalInstance),
  longitudinalRoute: () => (/* binding */ longitudinalRoute),
  modeInstance: () => (/* binding */ modeInstance),
  toolbarButtons: () => (/* reexport */ src.toolbarButtons),
  tracked: () => (/* binding */ tracked)
});

// EXTERNAL MODULE: ../../../node_modules/i18next/dist/esm/i18next.js
var i18next = __webpack_require__(40680);
;// ../../../modes/longitudinal/package.json
const package_namespaceObject = /*#__PURE__*/JSON.parse('{"UU":"@ohif/mode-longitudinal"}');
;// ../../../modes/longitudinal/src/id.js

const id = package_namespaceObject.UU;

// EXTERNAL MODULE: ../../../modes/basic/src/index.tsx + 4 modules
var src = __webpack_require__(35485);
;// ../../../modes/longitudinal/src/index.ts



const tracked = {
  measurements: '@ohif/extension-measurement-tracking.panelModule.trackedMeasurements',
  thumbnailList: '@ohif/extension-measurement-tracking.panelModule.seriesList',
  viewport: '@ohif/extension-measurement-tracking.viewportModule.cornerstone-tracked'
};
const extensionDependencies = {
  // Can derive the versions at least process.env.from npm_package_version
  ...src.extensionDependencies,
  '@ohif/extension-measurement-tracking': '^3.0.0'
};
const longitudinalInstance = {
  ...src.basicLayout,
  id: src.ohif.layout,
  props: {
    ...src.basicLayout.props,
    leftPanels: [tracked.thumbnailList],
    rightPanels: [src.cornerstone.segmentation, tracked.measurements],
    viewports: [{
      namespace: tracked.viewport,
      // Re-use the display sets from basic
      displaySetsToDisplay: src.basicLayout.props.viewports[0].displaySetsToDisplay
    }, ...src.basicLayout.props.viewports]
  }
};
const longitudinalRoute = {
  ...src.basicRoute,
  path: 'longitudinal',
  /*init: ({ servicesManager, extensionManager }) => {
    //defaultViewerRouteInit
  },*/
  layoutInstance: longitudinalInstance
};
const modeInstance = {
  ...src.modeInstance,
  // TODO: We're using this as a route segment
  // We should not be.
  id: id,
  routeName: 'viewer',
  displayName: i18next/* default */.A.t('Modes:Basic Viewer'),
  routes: [longitudinalRoute],
  extensions: extensionDependencies
};
const mode = {
  ...src.mode,
  id: id,
  modeInstance,
  extensionDependencies
};
/* harmony default export */ const longitudinal_src = (mode);


/***/ })

}]);