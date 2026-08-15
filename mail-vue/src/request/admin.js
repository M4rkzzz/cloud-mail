import {useUserStore} from '@/store/user.js';

export function isAdminSession() {
    return !!useUserStore().user?.permKeys?.includes('*');
}
