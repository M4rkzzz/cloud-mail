import http from '@/axios/index.js';
import {isAdminSession} from '@/request/admin.js'

export function roleAdd(params) {
    if (!isAdminSession()) return http.post('/role/add',params)
    return http.post('/admin/roles',params)
}

export function rolePermTree() {
    if (!isAdminSession()) return http.get('/role/permTree')
    return http.get('/admin/permissions')
}

export function roleRoleList() {
    if (!isAdminSession()) return http.get('/role/list')
    return http.get('/admin/roles')
}

export function roleSet(params) {
    if (!isAdminSession()) return http.put('/role/set',params)
    return http.put(`/admin/roles/${params.roleId}`,params)
}

export function roleDelete(roleId) {
    if (!isAdminSession()) return http.delete('/role/delete',{params:{roleId}})
    return http.delete(`/admin/roles/${roleId}`)
}

export function roleSetDef(roleId) {
    if (!isAdminSession()) return http.put('/role/setDefault',{roleId})
    return http.put(`/admin/roles/${roleId}/default`)
}


export function roleSelectUse() {
    if (isAdminSession()) return http.get('/admin/roles/select-use')
    return http.get('/role/selectUse')
}
