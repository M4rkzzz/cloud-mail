import http from '@/axios/index.js';
import {isAdminSession} from '@/request/admin.js'

export function regKeyList(params) {
    if (!isAdminSession()) return http.get('/regKey/list', {params:{...params}})
    return http.get('/admin/registration-keys', {params:{...params}})
}

export function regKeyAdd(form) {
    if (!isAdminSession()) return http.post('/regKey/add',form)
    return http.post('/admin/registration-keys',form)
}

export function regKeyDelete(regKeyIds) {
    if (!isAdminSession()) return http.delete('/regKey/delete?regKeyIds='+ regKeyIds)
    return http.delete('/admin/registration-keys', {params: {regKeyIds: regKeyIds + ''}})
}

export function regKeyClearNotUse() {
    if (!isAdminSession()) return http.delete('/regKey/clearNotUse')
    return http.delete('/admin/registration-keys/expired')
}

export function regKeyHistory(regKeyId) {
    if (!isAdminSession()) return http.get('/regKey/history', {params:{regKeyId}})
    return http.get(`/admin/registration-keys/${regKeyId}/history`)
}
