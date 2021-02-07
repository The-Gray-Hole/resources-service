var axios = require('axios').default;

export async function get_permissions
(
    identity_url: string,
    identity_token: string
)
{
    let permissions = await axios({
        method: 'get',
        url: `${identity_url}/permissions`,
        headers: {'access-token': identity_token}
    });
    if(permissions.status >= 300 || permissions.status < 200) {
        return null;
    }
    return permissions.data;
}

export async function create_permission
(
    identity_url: string,
    identity_token: string,
    title: string
)
{
    let permissions = await get_permissions(identity_url, identity_token);
    if(!permissions) return null;
    permissions = permissions.map(function(perm: any) {
        return perm.title;
    });

    if(!permissions.includes(title)) {
        let resp = await axios({
            method: 'post',
            url: `${identity_url}/permissions`,
            headers: {'access-token': identity_token},
            data: {
                title: title,
            }
        });
        if(resp.status >= 300 || resp.status < 200) {
            return null;
        }
    }
    return true;
}

export async function get_roles
(
    identity_url: string,
    identity_token: string
)
{
    let roles = await axios({
        method: 'get',
        url: `${identity_url}/roles`,
        headers: {'access-token': identity_token}
    });
    if(roles.status >= 300 || roles.status < 200) {
        return null;
    }
    return roles.data;
}

export async function create_role
(
    identity_url: string,
    identity_token: string,
    title: string,
    permisions: Array<string>
)
{
    let roles = await get_roles(identity_url, identity_token);
    if(!roles) return null;
    roles = roles.map(function(rol: any) {
        return rol.title;
    });

    if(!roles.includes(title)) {
        let resp = await axios({
            method: 'post',
            url: `${identity_url}/roles`,
            headers: {'access-token': identity_token},
            data: {
                title: title,
                permissions: permisions
            }
        });
        if(resp.status >= 300 || resp.status < 200) {
            return null;
        }
    }
    return true;
}

export async function check_permission
(
    identity_url: string,
    token: string,
    permission: string
)
{
    if(permission == "" || !token) {
        return false;
    }

    let resp = await axios({
        method: 'post',
        url: `${identity_url}/check_permission`,
        headers: {'access-token': token},
        data: {permission: permission}
    });
    return resp;
}
