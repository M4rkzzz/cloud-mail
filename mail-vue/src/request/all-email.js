import http from '@/axios/index.js';

export function allEmailList(params, admin = false) {
    return http.get(admin ? '/admin/emails' : '/allEmail/list', {params: {...params}})
}

export function allEmailDelete(emailIds, admin = false) {
    return admin
        ? http.delete('/admin/emails', {params: {emailIds: emailIds + ''}})
        : http.delete('/allEmail/delete?emailIds=' + emailIds)
}

export function allEmailBatchDelete(params, admin = false) {
    return admin
        ? http.post('/admin/emails/batch-delete', params)
        : http.delete('/allEmail/batchDelete', {params: params})
}

export function allEmailLatest(emailId, admin = false) {
    return http.get(admin ? '/admin/emails/latest' : '/allEmail/latest', {params: {emailId}, noMsg: true, timeout: 35 * 1000})
}

export function allEmailDetail(emailId) {
    return http.get(`/admin/emails/${emailId}`)
}

export function allEmailRead(emailIds, unread = 1) {
    return http.put('/admin/emails/read', {emailIds, unread})
}

export function allEmailRestore(emailIds) {
    return http.put('/admin/emails/restore', {emailIds})
}
