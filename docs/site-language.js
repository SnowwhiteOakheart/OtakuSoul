(() => {
  const current = new URL(window.location.href);
  const requested = current.searchParams.get('lang');
  const explicit = requested === 'de' || requested === 'en';
  let saved;
  try {
    if (explicit) localStorage.setItem('otakusoul-site-language', requested);
    saved = localStorage.getItem('otakusoul-site-language');
  } catch {
    // The language links also work when the browser blocks storage.
  }

  const pageLanguage = document.documentElement.lang;
  const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
  const supported = browserLanguages.map((language) => language?.split('-')[0].toLowerCase())
    .find((language) => language === 'de' || language === 'en');
  const preferred = explicit ? requested : saved || supported;
  if (pageLanguage !== 'en' || preferred !== 'de') return;

  const alternate = document.querySelector('link[rel="alternate"][hreflang="de"]');
  const destination = new URL(alternate.href);
  destination.search = current.search;
  destination.hash = current.hash;
  window.location.replace(destination.href);
})();
