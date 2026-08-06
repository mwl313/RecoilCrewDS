const params = new URLSearchParams(window.location.search);

if (params.has('materialDebug')) {
  void import('./materialDebug');
} else {
  void import('./main');
}
