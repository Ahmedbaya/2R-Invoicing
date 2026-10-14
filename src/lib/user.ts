const KEY = 'invoicing.userName'
export const getUserName = () => localStorage.getItem(KEY) ?? ''
export const setUserName = (v: string) => localStorage.setItem(KEY, v)
