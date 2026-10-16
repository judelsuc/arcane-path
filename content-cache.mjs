export function openContentCache() {
  let database;
  function db() {
    database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open("arcane-cell-content", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("content");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Content cache upgrade blocked by another tab."));
    });
    return database;
  }
  async function transact(mode, operation) {
    const connection = await db();
    return new Promise((resolve, reject) => {
      const transaction = connection.transaction("content", mode);
      const request = operation(transaction.objectStore("content"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error ?? request.error);
      transaction.onerror = () => reject(transaction.error ?? request.error);
    });
  }
  return {
    get: (key) => transact("readonly", (store) => store.get(key)),
    put: (key, value) => transact("readwrite", (store) => store.put(value, key)),
    clear: () => transact("readwrite", (store) => store.clear()),
  };
}
