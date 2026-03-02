FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm install

COPY src ./src

RUN npm run build && \
    cp -r src/config dist/

EXPOSE 3000

CMD ["npm", "start"]