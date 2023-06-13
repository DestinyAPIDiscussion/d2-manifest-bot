#!/usr/bin/env node

import { generateHttpClient } from '@d2api/manifest';
import { getDestinyManifest } from 'bungie-api-ts/destiny2';
import fetch from 'cross-fetch';
import fse from 'fs-extra';
import latest from '../latestManifest.json' assert { type: 'json' };

const { writeFileSync } = fse;
const httpClient = generateHttpClient(fetch, process.env.API_KEY);

const skipCheck = process.env.SKIP_CHECK === 'true' ? true : false;

// do the thing
(async () => {
  const manifestMetadata = await getDestinyManifest(httpClient);

  const current = manifestMetadata.Response.version;

  let content = '';

  if (!skipCheck) {
    console.log(`Latest:  ${latest}`);
    console.log(`Current: ${current}`);
    if (latest === current) {
      // nothing changed. no updates needed.
      return;
    }
    // if you are here, there's a new manifest
    console.log('New manifest detected');

    writeFileSync('latestManifest.json', `${JSON.stringify(current, null, 2)}\n`, 'utf8');

    content += 'The Destiny 2 manifest has been updated. ';
  }

  content += `Current Manifest: ${current}`;

  // if (!/^[.\w-]+$/.test(versionNumber)) { I AM NOT REALLY SURE THIS NEEDS DOING. }

  const requestOptions = {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content,
    }),
  };
  const response = await fetch(process.env.WEBHOOK!, requestOptions);

  if (!response.ok) {
    console.log('Webhook returned an error');
    console.log(response);
    process.exit(1);
  }
})().catch((e) => {
  console.log(e);
  process.exit(1);
});
