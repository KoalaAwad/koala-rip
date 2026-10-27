// koala.rip is reserved for the portfolio; until it moves there, send visitors to the archive.
// 302 rather than 301 so browsers don't cache the redirect past the switch.
const CANONICAL_HOST = "archive.koala.rip";

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "koala.rip") {
      url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 302);
    }
    return env.ASSETS.fetch(request);
  },
};
