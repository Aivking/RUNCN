import { sitesStore } from '@src/infrastructure/prun-api/data/sites';
import { productionStore } from '@src/infrastructure/prun-api/data/production';
import { workforcesStore } from '@src/infrastructure/prun-api/data/workforces';
import { userData } from '@src/store/user-data';
import {
  isAuthenticated,
  aggregateMyProduction,
  reportProduction,
} from '@src/features/XIT/FACTION/use-faction-api';

function init() {
  let reported = false;
  watchEffect(() => {
    if (reported) return;
    if (!sitesStore.fetched.value) return;
    if (!productionStore.fetched.value) return;
    if (!workforcesStore.fetched.value) return;
    if (!isAuthenticated()) return;

    const today = new Date().toISOString().slice(0, 10);
    if (userData.lastAutoProductionDate === today) return;

    reported = true;

    aggregateMyProduction()
      .then(items => {
        if (items.length === 0) {
          reported = false;
          return;
        }
        return reportProduction(items).then(() => {
          userData.lastAutoProductionDate = today;
        });
      })
      .catch(() => {
        reported = false;
      });
  });
}

features.add(import.meta.url, init, 'Auto-reports faction production once daily on login.');
