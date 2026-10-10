const KEYS = ['aiPunct', 'aiSpell'];
chrome.storage.local.get({ aiPunct: false, aiSpell: false }, (s) => {
  for (const k of KEYS) {
    const box = document.getElementById(k);
    box.checked = s[k];
    box.addEventListener('change', () => chrome.storage.local.set({ [k]: box.checked }));
  }
});
