#!/usr/bin/env node

import fetch from 'cross-fetch';
import { getDestinyManifest } from 'bungie-api-ts/destiny2';
import { generateHttpClient } from '@d2api/manifest';
import latest from '../latest.json' assert { type: 'json' };
import fse from 'fs-extra';

const { writeFileSync } = fse;
const httpClient = generateHttpClient(fetch, process.env.API_KEY);

const skipCheck = process.env.SKIP_CHECK === 'true' ? true : false;

// do the thing
(async () => {
  const manifestMetadata = await getDestinyManifest(httpClient);

  const current = manifestMetadata.Response.version;
  const newREADME = `# d2-manifest-bot\ngithub action for checking for new d2 manifest\n\n# Current Manifest: ${current}`;

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

    writeFileSync('latest.json', `${JSON.stringify(current, null, 2)}\n`, 'utf8');
    writeFileSync('README.md', newREADME, 'utf8');

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
