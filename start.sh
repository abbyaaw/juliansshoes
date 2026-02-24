#!/bin/sh
mkdir -p /data/images

if [ ! -f /data/shoes.db ]; then
  echo "Copying database..."
  cp /app/seed/shoes.db /data/shoes.db
fi

exec npm start
