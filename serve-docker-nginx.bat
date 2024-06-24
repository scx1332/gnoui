start http://127.0.0.1:3097
docker run -p "3097:80" -v ".\gnoui:/usr/share/nginx/html" --rm nginx
