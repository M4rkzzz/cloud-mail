import http from '@/axios/index.js'
import {isAdminSession} from '@/request/admin.js'


export function userList(params) {
    if (!isAdminSession()) {
        const query = {...params}
        if (query.status === -2) {
            delete query.status
            query.isDel = 1
        }
        return http.get('/user/list', {params: query})
    }
    const {num, status, ...rest} = params
    const query = {...rest, page: num}
    if (status === -2) query.status = -2
    else if (status !== undefined && status !== -1) query.status = status
    return http.get('/admin/users', {params: query})
}

export function userSetPwd(params) {
    if (!isAdminSession()) return http.put('/user/setPwd', params)
    return http.put(`/admin/users/${params.userId}/password`, {password: params.password})
}

export function userSetStatus(params) {
    if (!isAdminSession()) return http.put('/user/setStatus', params)
    return http.put(`/admin/users/${params.userId}/status`, {status: params.status})
}

export function userSetType(params) {
    if (!isAdminSession()) return http.put('/user/setType', params)
    return http.put(`/admin/users/${params.userId}/role`, {roleId: params.type})
}


export function userDelete(userIds) {
    if (!isAdminSession()) return http.delete('/user/delete', {params:{userIds: userIds + ''}})
    return http.delete('/admin/users', {params:{userIds: userIds + ''}})
}

export function userAdd(form) {
    if (!isAdminSession()) return http.post('/user/add', form)
    return http.post('/admin/users', form)
}

export function userRestSendCount(userId) {
    if (!isAdminSession()) return http.put('/user/resetSendCount', {userId})
    return http.put(`/admin/users/${userId}/send-count/reset`)
}

export function userRestore(userId,type) {
    if (!isAdminSession()) return http.put('/user/restore', {userId,type})
    return http.put(`/admin/users/${userId}/restore`, {includeData: type})
}

export function userAllAccount(userId, num, size) {
    if (!isAdminSession()) return http.get('/user/allAccount', {params:{userId,num,size}})
    const page = Math.max(1, Number(num) || 1)
    return http.get(`/admin/users/${userId}/accounts`, {params:{page,size}})
}

export function userDeleteAccount(accountId) {
    if (!isAdminSession()) return http.delete('/user/deleteAccount', {params:{accountId}})
    return http.delete(`/admin/accounts/${accountId}`)
}
