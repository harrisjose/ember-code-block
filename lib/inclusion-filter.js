module.exports = function inclusionFilter(packages) {
  return function(packageName) {
    if (packages.length === 0) {
      return true;
    }

    return packages.map(function(pkg) {
      return pkg;
    }).indexOf(packageName) > -1;
  };
};
