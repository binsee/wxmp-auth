'use strict'

const Api_authorize = 'https://open.weixin.qq.com/connect/oauth2/authorize?appid=APPID&redirect_uri=REDIRECT_URI&response_type=code&scope=SCOPE&state=STATE#wechat_redirect'
const Api_access_token = 'https://api.weixin.qq.com/sns/oauth2/access_token?appid=APPID&secret=SECRET&code=CODE&grant_type=authorization_code '
const Api_refresh_token = 'https://api.weixin.qq.com/sns/oauth2/refresh_token?appid=APPID&grant_type=refresh_token&refresh_token=REFRESH_TOKEN'
const Api_userinfo = 'https://api.weixin.qq.com/sns/userinfo?access_token=ACCESS_TOKEN&openid=OPENID&lang=zh_CN'
const Api_auth = 'https://api.weixin.qq.com/sns/auth?access_token=ACCESS_TOKEN&openid=OPENID'

const URL = require('url')
const uuid = require('uuid')
const request = require('request')


/**
 * 检查url是否合法
 *
 * @param {string} url 要检查的url
 * @returns {boolean} 是否为合法url
 * @ignore
 */

function checkUrl(url) {
  return /^(http|https):\/\//.test(url)
}

/**
 * 获取用户授权页面url
 *
 * 注意：如果用户已关注公众号，且从公众号的会话或自定义菜单中进入授权页，即使是`snsapi_userinfo`，也是静默授权的！
 *
 * @param {string} appid 公众号appid
 * @param {string} redirect_uri 授权回调页面url
 * @param {string} state
 * 访问标识，用于区分不同的用户。
 * 【可省略】默认生成uuid
 * @param {string} scope 用户授权作用域
 * 授权类型：
 * - snsapi_base 静默授权，不弹授权页面，直接跳转，仅获得openid
 * - snsapi_userinfo 显式授权，弹出授权页面，获得用户更多信息
 * 【可省略】默认使用静默授权
 * @returns {any} 成功则返回拼装结果，失败返回`false`
 *
 * ```javascript
 * {
 *    url: string,
 *    state: string,
 * }
 * ```
 *
 * 字段  |  描述
 * ----- | -----
 * url   | 拼装完成的授权url，用户在微信中打开后进入授权流程
 * state | 本次请求的访问标识，用于区分不同用户
 *
 */

function getAuthUrl(appid, redirect_uri, state, scope) {
  if (!checkUrl(redirect_uri) || !appid) {
    return false
  }
  const url = new URL.URL(Api_authorize)
  state = state || uuid.v1()

  url.searchParams.set('appid', appid)
  url.searchParams.set('redirect_uri', redirect_uri)
  url.searchParams.set('scope', scope || 'snsapi_base')
  url.searchParams.set('state', state)
  return { url: url.toString(), state }
}

/**
 * 获取访问Token
 *
 * 此步骤可以获取到用户的openid
 *
 * @param {string} appid 公众号appid
 * @param {string} r_url
 * 可提供两种参数：
 * - url 被请求的授权回调页面完整url，会自动提取code与state
 * - code 从授权回调请求参数中提取的code参数
 * @param {string} secret 公众号的appsecret
 * @returns {Promise} 返回一个Promise
 * 请求成功则Promise会返回一个Object如下：
 *
 * ```javascript
 * {
 *   access_token: 'ACCESS_TOKEN',
 *   expires_in: 7200,
 *   refresh_token: 'REFRESH_TOKEN',
 *   openid: 'OPENID',
 *   scope: 'SCOPE',
 *   state: string
 * }
 * ```
 *
 * 字段      |     描述
 * ------------- | -------------
 * access_token  | 网页授权接口调用凭证,注意：此access_token与基础支持的access_token不同
 * expires_in    | access_token接口调用凭证超时时间，单位（秒）
 * refresh_token | 刷新凭证
 * openid        | 用户唯一标识，请注意，在未关注公众号时，用户访问公众号的网页，也会产生一个用户和公众号唯一的OpenID
 * scope         | 用户授权的作用域，使用逗号（,）分隔
 * state         | 本次访问请求标识
 *
 */

function getToken(appid, r_url, secret) {
  return new Promise((resolve, reject) => {
    let code
    let state
    if (!r_url || !appid || !secret) {
      reject(false)
    }
    if (checkUrl(r_url)) {
      const u = new URL.URL(r_url)
      code = u.searchParams.get('code')
      state = u.searchParams.get('state')
    } else {
      code = r_url
    }
    const url = new URL.URL(Api_access_token)
    url.searchParams.set('appid', appid)
    url.searchParams.set('secret', secret)
    url.searchParams.set('code', code)
    request(url.toString(), (err, res, body) => {
      let json
      if (err) {
        reject(false)
      }
      try {
        json = JSON.parse(body)
      } catch (e) {
        reject(false)
      }
      if (!json || !json.access_token) {
        reject(false)
      }
      const data = {
        access_token: json.access_token,
        expires_in: json.expires_in,
        refresh_token: json.refresh_token,
        openid: json.openid,
        scope: json.scope,
        state,
      }
      resolve(data)
    })
  })
}

/**
 * 刷新token
 *
 * 由于access_token有效期较短，如果授权方式为 snsapi_userinfo，且想长期静默获取用户的信息，需要定期刷新token，以维持access_token与refresh_token的有效性。
 *
 * 备注：
 * - access_token 有效期为 7200秒
 * - refresh_token 有效期为 30天
 *
 * @param {string} appid  公众号appid
 * @param {string} refresh_token 刷新凭证
 * @returns {Promise} 返回一个Promise
 * 请求成功则Promise会返回一个Object如下：
 *
 * ```javascript
 * {
 *   access_token: 'ACCESS_TOKEN',
 *   expires_in: 7200,
 *   refresh_token: 'REFRESH_TOKEN',
 *   openid: 'OPENID',
 *   scope: 'SCOPE',
 * }
 * ```
 *
 * 字段      |     描述
 * ------------- | -------------
 * access_token  | 网页授权接口调用凭证,注意：此access_token与基础支持的access_token不同
 * expires_in    | access_token接口调用凭证超时时间，单位（秒）
 * refresh_token | 刷新凭证
 * openid        | 用户唯一标识，请注意，在未关注公众号时，用户访问公众号的网页，也会产生一个用户和公众号唯一的OpenID
 * scope         | 用户授权的作用域，使用逗号（,）分隔
 *
 */

function refreshToken(appid, refresh_token) {
  return new Promise((resolve, reject) => {
    if (!appid || !refresh_token) {
      reject(false)
    }
    const url = new URL.URL(Api_refresh_token)
    url.searchParams.set('appid', appid)
    url.searchParams.set('refresh_token', refresh_token)
    request(url.toString(), (err, res, body) => {
      let json
      if (err) {
        reject(false)
      }
      try {
        json = JSON.parse(body)
      } catch (e) {
        reject(false)
      }
      if (!json || !json.access_token) {
        reject(false)
      }
      const data = {
        access_token: json.access_token,
        expires_in: json.expires_in,
        refresh_token: json.refresh_token,
        openid: json.openid,
        scope: json.scope,
      }
      resolve(data)
    })
  })
}

/**
 * 拉取用户详细
 *
 * 仅限授权作用域为 `snsapi_userinfo` 有效。
 *
 * @param {string} access_token 网页授权接口调用凭证
 * @param {string} openid 用户openid
 * @param {string} lang 返回信息的语言版本
 * 【可省略】默认为 简体中文
 * - zh_CN 简体中文
 * - zh_TW 繁体中文
 * - en 英语
 * @returns {Promise} 返回一个Promise
 * 请求成功则Promise会返回一个Object如下：
 *
 * ```javascript
 * {
 *   openid: 'OPENID',
 *   nickname: 'NICKNAME',
 *   sex: '1',
 *   province: 'PROVINCE',
 *   city: 'CITY',
 *   country: 'COUNTRY',
 *   headimgurl: 'http://wx.qlogo.cn/mmopen/g3MonUZtNHkdmzicIlibx6iaFqAc56vxLSUfpb6n5WKSYVY0ChQKkiaJSgQ1dZuTOgvLLrhJbERQQ4eMsv84eavHiaiceqxibJxCfHe/46',
 *   privilege: ['PRIVILEGE1', 'PRIVILEGE2'],
 *   unionid: 'o6_bmasdasdsad6_2sgVt7hMZOPfL',
 * }
 * ```
 *
 * 字段    |   描述
 * ---------- | ---------
 * openid     | 用户的唯一标识
 * nickname   | 用户昵称
 * sex        | 用户的性别，值为1时是男性，值为2时是女性，值为0时是未知
 * province   | 用户个人资料填写的省份
 * city       | 普通用户个人资料填写的城市
 * country    | 国家，如中国为CN
 * headimgurl | 用户头像，最后一个数值代表正方形头像大小（有0、46、64、96、132数值可选，0代表640*640正方形头像），用户没有头像时该项为空。若用户更换头像，原有头像URL将失效。
 * privilege  | 用户特权信息，json 数组，如微信沃卡用户为（chinaunicom）
 * unionid    | 只有在用户将公众号绑定到微信开放平台帐号后，才会出现该字段。
 *
 */

function getUserinfo(access_token, openid, lang) {
  return new Promise((resolve, reject) => {
    if (!access_token || !openid) {
      reject(false)
    }
    const url = new URL.URL(Api_userinfo)
    url.searchParams.set('access_token', access_token)
    url.searchParams.set('openid', openid)
    if (lang) {
      url.searchParams.set('lang', lang)
    }
    request(url.toString(), (err, res, body) => {
      let json
      if (err) {
        reject(false)
      }
      try {
        json = JSON.parse(body)
      } catch (e) {
        reject(false)
      }
      if (!json || !json.openid) {
        reject(false)
      }
      resolve(json)
    })
  })
}


/**
 * 校验授权凭证是否有效
 *
 * 如果授权作用域为 `snsapi_userinfo`，则拉取用户详细信息前可以先检查授权凭证是否有效。
 * 如果授权凭证已失效，可调用刷新凭证。
 *
 * @param {string} access_token 网页授权接口调用凭证
 * @param {string} openid 用户openid
 * @returns {Promise} 返回一个Promise
 * 请求成功则Promise返回一个boolean值，如果是true则凭证有效
 *
 */

function checkAccessToken(access_token, openid) {
  return new Promise((resolve, reject) => {
    if (!access_token || !openid) {
      reject(false)
    }
    const url = new URL.URL(Api_access_token)
    url.searchParams.set('access_token', access_token)
    url.searchParams.set('openid', openid)
    request(url.toString(), (err, res, body) => {
      let json
      if (err) {
        reject(false)
      }
      try {
        json = JSON.parse(body)
      } catch (e) {
        reject(false)
      }
      if (!json || json.errcode !== 0) {
        reject(false)
      }
      resolve(true)
    })
  })
}

module.exports = {
  getAuthUrl,
  getToken,
  getUserinfo,
  refreshToken,
  checkAccessToken,
}
