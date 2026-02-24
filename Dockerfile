FROM node:22-slim

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY client/package.json client/
COPY server/package.json server/

# Install all dependencies (including dev for building)
RUN npm install

# Copy source
COPY . .

# Build the client
RUN cd client && npm run build

# Create data directories
RUN mkdir -p /data/images/Uploads

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/data/shoes.db
ENV SHOE_IMAGES_DIR=/data/images

EXPOSE 3000

CMD ["npm", "start"]
