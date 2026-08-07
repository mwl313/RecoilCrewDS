const params = new URLSearchParams(window.location.search);

if (params.has('capacity')) {
  void import('./capacityBenchmark');
} else if (params.has('materialDebug')) {
  void import('./materialDebug');
} else {
  void import('./main');
}
