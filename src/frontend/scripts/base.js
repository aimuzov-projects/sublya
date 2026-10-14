// the VPS serves the site from the domain root, GitHub Pages from /site
export const withBase = (path) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path}`
