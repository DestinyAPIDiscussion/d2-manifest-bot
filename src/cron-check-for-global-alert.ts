#!/usr/bin/env node

import { generateHttpClient } from '@d2api/manifest';
import { GlobalAlertLevel, getGlobalAlerts } from 'bungie-api-ts/core';
import fetch from 'cross-fetch';
import fse from 'fs-extra';
import latest from '../latestGlobalAlert.json' assert { type: 'json' };

const { writeFileSync } = fse;
const httpClient = generateHttpClient(fetch, process.env.API_KEY);

const skipCheck = process.env.SKIP_CHECK === 'true' ? true : false;

// do the thing
(async () => {
  const manifestMetadata = await getGlobalAlerts(httpClient, { includestreaming: false });
  const latestDate = new Date(latest);

  const currentAlerts = manifestMetadata.Response.filter(
    (alert) => new Date(alert.AlertTimestamp) > latestDate
  ).sort((a, b) => new Date(a.AlertTimestamp).getTime() - new Date(b.AlertTimestamp).getTime());

  const embeds: {
    title: string;
    description: string;
    url: string;
    timestamp: string;
    color?: string;
  }[] = [];

  currentAlerts.forEach((alert) => {
    let color = undefined;
    switch (alert.AlertLevel) {
      case GlobalAlertLevel.Blue:
        color = '0x479be4';
        break;
      case GlobalAlertLevel.Yellow:
        color = '0xffce1f';
        break;
      case GlobalAlertLevel.Red:
        color = '0xf44336';
        break;
    }

    embeds.push({
      title: alert.AlertKey,
      description: alert.AlertHtml,
      url: alert.AlertLink,
      timestamp: alert.AlertTimestamp,
      color,
    });
  });

  const current = currentAlerts.pop()?.AlertTimestamp;

  if (!skipCheck) {
    console.log(`Latest:  ${latest}`);
    console.log(`Current: ${current}`);
    if (!current) {
      // nothing changed. no updates needed.
      return;
    }
    // if you are here, there's a new manifest
    console.log('New alert(s) detected');

    writeFileSync('latestGlobalAlert.json', `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  }

  // if (!/^[.\w-]+$/.test(versionNumber)) { I AM NOT REALLY SURE THIS NEEDS DOING. }

  const requestOptions = {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      embeds,
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
