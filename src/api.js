import { adminAuth, auth } from './firebase';
import { broadcastRealtimeMutation } from './realtime';
import { syncServerClock } from './wall-clock';

const PUBLIC_NAMES = ['sendPasswordReset', 'confirmEmailVerification', 'getPublicQr', 'submitClaim'];
const ADMIN_PUBLIC_NAMES = ['adminPasswordLogin'];

const MUTATION_NAMES = new Set([
  'ensureUser',
  'updateProfile',
  'createStickerRequest',
  'requestAccess',
  'recordSale',
  'activateQr',
  'deleteQr',
  'deleteQrs',
  'deleteQrGroup',
  'updateSaleAmount',
  'returnSale',
  'startPayment',
  'completeSandboxPayment',
  'upgradeStickerRequestToPhysical',
  'markNotificationRead',
  'deleteNotification',
  'clearNotifications',
  'generateQrs',
  'updateStickerRequest',
  'deleteStickerRequest',
  'setStickerPricing',
  'setUserAccess',
  'resolveAccessRequest',
  'revokeUserAccess',
  'setUserStatus',
  'sendNotification',
  'clearAiChat',
  'aiChat',
  'deleteAiMessage',
  'startSupportChat',
  'sendSupportMessage',
  'deleteSupportMessage',
  'editSupportMessage',
  'adminOpenSupport',
  'adminSendSupportMessage',
  'adminDeleteSupportMessage',
  'adminEditSupportMessage',
  'adminResolveSupport',
  'submitClaim',
  'updateClaimStatus',
  'resetDemoData',
]);

function toError(error, fallbackMessage = 'Please try again.') {
  const message = error?.message || fallbackMessage;
  const wrapped = new Error(message);
  wrapped.code = error?.code || 'unknown';
  wrapped.status = error?.status;
  return wrapped;
}

let seedPromise = null;

function ensureSeed() {
  if (!seedPromise) {
    seedPromise = import('./demo/seed.js')
      .then(({ ensureSeeded }) => ensureSeeded())
      .catch(error => {
        seedPromise = null;
        throw error;
      });
  }
  return seedPromise;
}

function client(authClient, publicNames = []) {
  async function call(name, data = {}, { timeoutMs } = {}) {
    const needsAuth = !publicNames.includes(name);
    const user = authClient.currentUser;
    if (needsAuth && !user) {
      const error = new Error('Please sign in first.');
      error.code = 'unauthenticated';
      throw error;
    }
    const identity = user
      ? { uid: user.uid, email: user.email || '', emailVerified: Boolean(user.emailVerified) }
      : null;
    try {
      await ensureSeed();
      const { handleApi } = await import('./demo/backend.js');
      const payload = await handleApi(name, data, { identity, timeoutMs });
      if (payload && typeof payload === 'object' && payload.serverTime) {
        syncServerClock(payload.serverTime);
      }
      if (MUTATION_NAMES.has(name)) broadcastRealtimeMutation(name);
      return payload;
    } catch (error) {
      throw toError(error);
    }
  }

  async function fetchSupportImageBlob(imageId) {
    const user = authClient.currentUser;
    if (!user) {
      const error = new Error('Please sign in first.');
      error.code = 'unauthenticated';
      throw error;
    }
    const { image } = await call('getSupportImage', { imageId });
    const dataUrl = image?.dataUrl || image?.url || '';
    if (!dataUrl.startsWith('data:')) {
      const error = new Error('Unable to load image.');
      error.code = 'not-found';
      throw error;
    }
    const response = await fetch(dataUrl);
    return response.blob();
  }

  return {
    sendVerificationEmail: () => call('sendVerificationEmail'),
    confirmEmailVerification: token => call('confirmEmailVerification', { token }),
    sendPasswordReset: email => call('sendPasswordReset', { email }),
    ensureUser: () => call('ensureUser'),
    updateProfile: data => call('updateProfile', data),
    dashboard: (data = {}) => call('getDashboard', data),
    createRequest: data => call('createStickerRequest', data),
    requestAccess: data => call('requestAccess', data),
    getQr: code => call('getQr', { code }),
    getPublicQr: code => call('getPublicQr', { code }),
    recordSale: data => call('recordSale', data),
    activateQr: data => call('activateQr', data),
    deleteQr: code => call('deleteQr', { code }),
    deleteQrs: codes => call('deleteQrs', { codes }),
    deleteQrGroup: groupId => call('deleteQrGroup', { groupId }),
    updateSaleAmount: data => call('updateSaleAmount', data),
    returnSale: data => call('returnSale', data),
    startPayment: data => call('startPayment', data),
    startStickerPayment: data => call('startPayment', { ...data, kind: 'sticker_request' }),
    upgradeStickerRequest: requestId => call('upgradeStickerRequestToPhysical', { requestId }),
    getSandboxPayment: paymentId => call('getSandboxPayment', { paymentId }),
    completeSandboxPayment: data => call('completeSandboxPayment', data),
    markNotificationRead: notificationId => call('markNotificationRead', { notificationId }),
    deleteNotification: notificationId => call('deleteNotification', { notificationId }),
    clearNotifications: () => call('clearNotifications'),
    adminPasswordLogin: data => call('adminPasswordLogin', data),
    adminSummary: () => call('adminSummary'),
    generateQrs: requestId => call('generateQrs', { requestId }),
    updateStickerRequest: data => call('updateStickerRequest', data),
    deleteStickerRequest: requestId => call('deleteStickerRequest', { requestId }),
    setStickerPricing: data => call('setStickerPricing', data),
    setUserAccess: data => call('setUserAccess', data),
    resolveAccessRequest: data => call('resolveAccessRequest', data),
    revokeUserAccess: uid => call('revokeUserAccess', { uid }),
    setUserStatus: data => call('setUserStatus', data),
    sendNotification: data => call('sendNotification', data),

    getAiChat: () => call('getAiChat'),
    clearAiChat: () => call('clearAiChat'),
    aiChat: message => call('aiChat', { message }),
    deleteAiMessage: messageId => call('deleteAiMessage', { messageId }),
    getAiInsights: () => call('getAiInsights'),

    getSupportThread: () => call('getSupportThread'),
    startSupportChat: (data = {}) => call('startSupportChat', data),
    sendSupportMessage: data => call('sendSupportMessage', data),
    deleteSupportMessage: messageId => call('deleteSupportMessage', { messageId }),
    editSupportMessage: (messageId, message) => call('editSupportMessage', { messageId, message }),
    getSupportImage: imageId => call('getSupportImage', { imageId }),
    fetchSupportImageBlob,

    getClaims: () => call('getClaims'),
    getClaim: claimId => call('getClaim', { claimId }),
    submitClaim: data => call('submitClaim', data),
    updateClaimStatus: data => call('updateClaimStatus', data),

    adminSupportQueue: () => call('adminSupportQueue'),
    adminOpenSupport: (data = {}) => call('adminOpenSupport', data),
    adminSendSupportMessage: data => call('adminSendSupportMessage', data),
    adminGetSupportMessages: threadId => call('adminGetSupportMessages', { threadId }),
    adminDeleteSupportMessage: messageId => call('adminDeleteSupportMessage', { messageId }),
    adminEditSupportMessage: (messageId, message) => call('adminEditSupportMessage', { messageId, message }),
    adminResolveSupport: data => call('adminResolveSupport', data),
  };
}

export const api = client(auth, PUBLIC_NAMES);
export const adminApi = client(adminAuth, ADMIN_PUBLIC_NAMES);
