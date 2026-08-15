import http from '@/axios/index.js';
import {isAdminSession} from '@/request/admin.js'

export function settingSet(setting) {
    if (!isAdminSession()) return http.put('/setting/set',setting)
    return http.put('/admin/settings',setting)
}

export function settingQuery() {
    if (!isAdminSession()) return http.get('/setting/query')
    return http.get('/admin/settings')
}

export function websiteConfig() {
    return http.get('/setting/websiteConfig')
}

export function setBackground(background) {
    if (!isAdminSession()) return http.put('/setting/setBackground',{background})
    return http.put('/admin/settings/background',{background})
}

export function deleteBackground() {
    if (!isAdminSession()) return http.delete('/setting/deleteBackground')
    return http.delete('/admin/settings/background')
}
