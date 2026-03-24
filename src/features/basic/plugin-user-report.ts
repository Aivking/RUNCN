import { userDataStore } from '@src/infrastructure/prun-api/data/user-data';
import { companyStore } from '@src/infrastructure/prun-api/data/company';
import { reportPluginUser } from '@src/features/XIT/FACTION/use-faction-api';

function init() {
  let reported = false;
  watchEffect(() => {
    if (reported) return;
    const username = userDataStore.username;
    const companyName = companyStore.value?.name;
    if (!username || !companyName) return;

    reported = true;
    reportPluginUser(username, companyName).catch(() => {
      reported = false;
    });
  });
}

features.add(import.meta.url, init, 'Reports plugin usage on game open.');
