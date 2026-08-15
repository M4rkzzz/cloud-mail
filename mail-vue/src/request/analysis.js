import http from '@/axios/index.js'
import {isAdminSession} from '@/request/admin.js'

export function analysisEcharts(timeZone) {
    if (!isAdminSession()) return http.get('/analysis/echarts',{params: {timeZone}});
    return http.get('/admin/analytics',{params: {timeZone}});
}
