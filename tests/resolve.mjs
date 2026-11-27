const vendor = new URL('../vendor/three/', import.meta.url);
export function resolve(specifier, context, next) {
  if (specifier === 'three') return next(new URL('build/three.module.min.js', vendor).href, context);
  if (specifier.startsWith('three/addons/')) return next(new URL(`examples/jsm/${specifier.slice(13)}`, vendor).href, context);
  return next(specifier, context);
}
