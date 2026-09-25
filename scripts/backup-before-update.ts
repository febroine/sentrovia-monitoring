import "@/worker/load-env";
import { createDeploymentBackup } from "@/lib/system/automatic-backup";

createDeploymentBackup()
  .then(({ fileName }) => console.log(`Verified pre-update database backup: ${fileName}`))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Pre-update database backup failed.");
    process.exitCode = 1;
  });
