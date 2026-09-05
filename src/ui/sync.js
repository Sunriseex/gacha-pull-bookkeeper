export const isLocalSyncPage = (location) =>
  ["http:", "https:"].includes(location.protocol) &&
  ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

export const promptSyncToken = ({ dialog, saveToken }) => {
  const input = dialog.querySelector("#tokenDialogInput");
  const cancel = dialog.querySelector("#tokenDialogCancel");
  input.value = "";
  dialog.returnValue = "";
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      dialog.removeEventListener("close", onClose);
      dialog.removeEventListener("cancel", onCancel);
      cancel.removeEventListener("click", onCancelClick);
    };
    const onClose = () => {
      cleanup();
      const token = dialog.returnValue === "save" ? input.value.trim() : "";
      input.value = "";
      try {
        if (token) saveToken(token);
        resolve(token);
      } catch (error) {
        reject(error);
      }
    };
    const onCancel = () => { dialog.returnValue = "cancel"; };
    const onCancelClick = () => dialog.close("cancel");
    dialog.addEventListener("close", onClose);
    dialog.addEventListener("cancel", onCancel);
    cancel.addEventListener("click", onCancelClick);
    try {
      dialog.showModal();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
};
