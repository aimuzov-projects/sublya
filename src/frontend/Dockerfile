FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html style.css app.js favicon.svg /usr/share/nginx/html/
COPY media /usr/share/nginx/html/media
