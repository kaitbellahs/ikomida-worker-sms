FROM  node:16-alpine AS build

ARG PROJECT_ID
ARG GOOGLE_SERVICE_ACCOUNT
ENV GOOGLE_APPLICATION_CREDENTIALS /worker/serviceAccount.json
RUN apk update && apk --no-cache -U upgrade && apk add --no-cache curl
ENV PYTHONUNBUFFERED=1
RUN apk add --update --no-cache python3 && ln -sf python3 /usr/bin/python
RUN python3 -m ensurepip
RUN pip3 install --no-cache --upgrade pip setuptools
RUN curl https://dl.google.com/dl/cloudsdk/release/google-cloud-sdk.tar.gz > /tmp/google-cloud-sdk.tar.gz
RUN mkdir -p /usr/local/gcloud
RUN  tar -C /usr/local/gcloud -xvf /tmp/google-cloud-sdk.tar.gz
RUN  /usr/local/gcloud/google-cloud-sdk/install.sh
ENV PATH $PATH:/usr/local/gcloud/google-cloud-sdk/bin

RUN mkdir -p /worker 
WORKDIR /worker

RUN apk add --no-cache npm && echo $GOOGLE_SERVICE_ACCOUNT > /worker/serviceAccount_b64 && base64 -d /worker/serviceAccount_b64 > $GOOGLE_APPLICATION_CREDENTIALS && gcloud auth activate-service-account --key-file $GOOGLE_APPLICATION_CREDENTIALS && export PATH="$(yarn global bin):$PATH" && yarn global add google-artifactregistry-auth

RUN echo "@ikomida:registry=https://us-central1-npm.pkg.dev/$PROJECT_ID/node/" >> .npmrc && echo "//us-central1-npm.pkg.dev/$PROJECT_ID/node/:always-auth=true" >> .npmrc

COPY package.json .eslintignore .prettierrc api-extractor.json rollup.config.js tsconfig.json ./
RUN yarn glogin && yarn install

COPY ./src /worker/src
RUN yarn build && yarn install --production

FROM node:16-alpine AS final

ENV NODE_ENV production

RUN apk update && apk --no-cache -U upgrade && addgroup -g 3000  ikomida && deluser --remove-home node && adduser -u 1000 -G ikomida -s /bin/sh -D -h /worker ikomida && chown 1000:3000 /worker
USER ikomida
WORKDIR /worker

COPY --chown=ikomida:ikomida --from=build /worker/package.json ./
COPY --chown=ikomida:ikomida --from=build /worker/node_modules ./node_modules/
COPY --chown=ikomida:ikomida --from=build /worker/build ./build/

ENTRYPOINT ["node", "--enable-source-maps", "build/worker.js"]