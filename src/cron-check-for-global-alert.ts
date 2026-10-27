#!/usr/bin/env node

import { generateHttpClient } from '@d2api/manifest';
import { GlobalAlertLevel, getGlobalAlerts } from 'bungie-api-ts/core';
import fetch from 'cross-fetch';
import fse from 'fs-extra';

const { readFileSync, writeFileSync } = fse;

const stateFile = 'latestGlobalAlert.json';
// Forget alert keys that are no longer active and were last recorded this long ago.
const seenRetentionMs = 30 * 24 * 60 * 60 * 1000;

interface AlertState {
  // AlertKey -> last time it was recorded as active (ISO string)
  seen: Record<string, string>;
}

// The state file used to hold just the newest AlertTimestamp. Bungie bumps
// AlertTimestamp on existing alerts, so we now track alerts by AlertKey instead.
const rawState: unknown = JSON.parse(readFileSync(stateFile, 'utf8'));
const legacyLatest = typeof rawState === 'string' ? new Date(rawState) : undefined;
const state: AlertState = legacyLatest ? { seen: {} } : (rawState as AlertState);

const httpClient = generateHttpClient(fetch, process.env.API_KEY);

const skipCheck = process.env.SKIP_CHECK === 'true' ? true : false;

// do the thing
(async () => {
  const manifestMetadata = await getGlobalAlerts(httpClient, { includestreaming: false });
  const now = new Date();

  const currentAlerts = manifestMetadata.Response.filter((alert, i, alerts) =>
    // drop alerts we've already posted, and duplicate keys within this response
    legacyLatest
      ? new Date(alert.AlertTimestamp) > legacyLatest
      : !state.seen[alert.AlertKey] && alerts.findIndex((a) => a.AlertKey === alert.AlertKey) === i
  ).sort((a, b) => new Date(a.AlertTimestamp).getTime() - new Date(b.AlertTimestamp).getTime());

  const seen: Record<string, string> = {};
  for (const [key, lastSeen] of Object.entries(state.seen)) {
    if (now.getTime() - new Date(lastSeen).getTime() < seenRetentionMs) {
      seen[key] = lastSeen;
    }
  }
  for (const alert of manifestMetadata.Response) {
    seen[alert.AlertKey] = now.toISOString();
  }
  const newState: AlertState = { seen };

  const embeds: {
    title: string;
    description: string;
    url: string;
    timestamp: string;
    color?: number;
  }[] = [];

  currentAlerts.forEach((alert) => {
    let color = undefined;
    switch (alert.AlertLevel) {
      case GlobalAlertLevel.Blue:
        color = parseInt('479be4;', 16);
        break;
      case GlobalAlertLevel.Yellow:
        color = parseInt('ffce1f', 16);
        break;
      case GlobalAlertLevel.Red:
        color = parseInt('f44336', 16);
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

  if (!skipCheck) {
    console.log(`Seen:    ${Object.keys(state.seen).join(', ')}`);
    console.log(`Current: ${manifestMetadata.Response.map((a) => a.AlertKey).join(', ')}`);
    if (legacyLatest) {
      // migrate to the new state format even if there's nothing to post
      writeFileSync(stateFile, `${JSON.stringify(newState, null, 2)}\n`, 'utf8');
    }
    if (!currentAlerts.length) {
      // nothing new. no updates needed.
      return;
    }
    console.log('New alert(s) detected');
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

  if (!skipCheck) {
    writeFileSync(stateFile, `${JSON.stringify(newState, null, 2)}\n`, 'utf8');
  }
})().catch((e) => {
  console.log(e);
  process.exit(1);
});
