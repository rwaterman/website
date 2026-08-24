/**
 * CloudFront viewer-request function (cloudfront-js-2.0): 301 every request for the legacy
 * apex or any of its subdomains to the same host under the new apex, keeping path and
 * query string. The origin is never reached.
 */
export function buildRedirectFunctionCode(legacyApex: string, apex: string): string {
  return `function handler(event) {
  var request = event.request;
  var host = request.headers.host.value;
  var suffixAt = host.lastIndexOf('${legacyApex}');
  var target = (suffixAt >= 0 ? host.substring(0, suffixAt) : '') + '${apex}';
  var params = [];
  Object.keys(request.querystring).forEach(function (key) {
    var entry = request.querystring[key];
    (entry.multiValue || [entry]).forEach(function (item) {
      params.push(key + '=' + item.value);
    });
  });
  var query = params.length ? '?' + params.join('&') : '';
  return {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: { location: { value: 'https://' + target + request.uri + query } }
  };
}`;
}
