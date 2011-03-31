/*
R53 Fox - a GUI client of Amazon Route 53
Copyright (C) 2011 Genki Sugawara

This program is free software; you can redistribute it and/or
modify it under the terms of the GNU General Public License
as published by the Free Software Foundation; either version 2
of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program; if not, write to the Free Software
Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
*/

var EXPORTED_SYMBOLS = ['R53Client'];

Components.utils.import('resource://r53fox/sha1.jsm');
Components.utils.import('resource://r53fox/base64.jsm');
Components.utils.import('resource://r53fox/jssha256.jsm');

var window = Components.classes["@mozilla.org/appshell/appShellService;1"].getService(Components.interfaces.nsIAppShellService).hiddenDOMWindow;
var XMLHttpRequest = window.XMLHttpRequest;

// sha256 encoding function
function b64_hmac_sha256(key, data) {
  HMAC_SHA256_init(key);
  HMAC_SHA256_write(data);
  var ary = HMAC_SHA256_finalize();

  var str = '';

  for (var i = 0; i < ary.length; i++) {
    str += String.fromCharCode(ary[i]);
  }

  return rstr2b64(str);
}

// classs R53Client
function R53Client(accessKeyId, secretAccessKey, algorythm) {
  this.accessKeyId = accessKeyId;
  this.secretAccessKey = secretAccessKey;
  this.algorythm = algorythm;
}

R53Client.prototype = {
  USER_AGENT: 'R53Client/0.1.0',
  HOST: 'route53.amazonaws.com',
  API_VERSION: '2010-10-01',
  TIMEOUT: 30000,

  // Actions on Hosted Zones
  createHostedZone: function(xml, callback) {
    var url = this.url('hostedzone');

    var xhr = new XMLHttpRequest();
    xhr.open('POST', url, !!callback);
    xhr.setRequestHeader('Content-Length', xml.length);
    xhr.setRequestHeader('Content-Type', 'text/xml');

    return this.query(xhr, xml, callback);
  },

  getHostedZone: function(hostedZoneId, callback) {
    var url = this.url('hostedzone', hostedZoneId);
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, !!callback);

    return this.query(xhr, null, callback);
  },

  deleteHostedZone: function(hostedZoneId, callback) {
    var url = this.url('hostedzone', hostedZoneId);
    var xhr = new XMLHttpRequest();
    xhr.open('DELETE', url, !!callback);

    return this.query(xhr, null, callback);
  },

  listHostedZones: function(params, callback) {
    var url = this.url('hostedzone');

    if (params) {
      var qs = this.queryString(params);
      url += ('?' + qs);
    }

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, !!callback);

    return this.query(xhr, null, callback);
  },

  // Actions on Resource Records Sets
  changeResourceRecordSets: function(hostedZoneId, xml, callback) {
    var url = this.url('hostedzone', hostedZoneId, 'rrset');

    var xhr = new XMLHttpRequest();
    xhr.open('POST', url, !!callback);
    xhr.setRequestHeader('Content-Length', xml.length);
    xhr.setRequestHeader('Content-Type', 'text/xml');

    return this.query(xhr, xml, callback);
  },

  listResourceRecordSets: function(hostedZoneId, params, callback) {
    var url = this.url('hostedzone', hostedZoneId, 'rrset');

    if (params) {
      var qs = this.queryString(params);
      url += ('?' + qs);
    }

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, !!callback);

    return this.query(xhr, null, callback);
  },

  getChange: function(changeId, callback) {
    var url = this.url('change', changeId);
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, !!callback);

    return this.query(xhr, null, callback);
  },

  // private
  query: function(xhr, body, callback) {
    var date = (new Date()).toUTCString();
    xhr.setRequestHeader('X-Amzn-Authorization', this.xAmznAuthorization(date));
    xhr.setRequestHeader('Host', this.HOST);
    xhr.setRequestHeader('x-amz-date', date);
    xhr.setRequestHeader('User-Agent', this.USER_AGENT);
    xhr.setRequestHeader('Connection', 'close');

    function extxhr() {
      xhr.success = function() {
        return (xhr.status && xhr.status >= 200 && xhr.status < 300);
      };

      xhr.callback = function(xhr) {
        callback && callback(xhr);
      };

      xhr.xml = function() {
        var responseText = xhr.responseText;
        responseText = responseText.replace(/<\s*\?\s*xml\s+version\s*=\s*"[^"]*"\s*\?\s*>/, '');
        responseText = responseText.replace(/xmlns="[^"]*"/, '');
        var xml = new XML(responseText);
        return xml;
      };

      return xhr;
    }

    if (callback) {
      xhr.onreadystatechange = function() {
        if (xhr.readyState != 4) { return; }
        try {
          extxhr().callback();
        } catch (e) {
          window.alert(e);
        }
      };
    } else {
      xhr.onreadystatechange = function() {};
    }

    var timer = window.setTimeout(xhr.abort, this.TIMEOUT);

    try {
      xhr.send(body);
      window.clearTimeout(timer);
    } catch(e) {
      if (!callback) { clearTimeout(timer); }
      throw e;
    }

    return extxhr();
  }, // query

  xAmznAuthorization: function(date) {
    var signature = null;

    if (this.algorythm == 'HmacSHA1') {
      signature = b64_hmac_sha1(this.secretAccessKey, date);
    } else {
      signature = b64_hmac_sha256(this.secretAccessKey, date);
    }

    var params = [
      'AWSAccessKeyId=' + this.accessKeyId,
      'Algorithm=' + this.algorythm,
      'Signature=' + signature];

    return 'AWS3-HTTPS ' + params.join(',');
  }, // xAmznAuthorization

  queryString: function(params) {
    if (params.length == 0) {
      return null;
    }

    function encode(str) {
      str = encodeURIComponent(str);

      var func = function(m) {
        switch(m) {
        case '!':
          return '%21';
        case "'":
          return '%27';
        case '(':
          return '%28';
        case ')':
          return '%29';
        case '*':
          return '%2A';
        default:
          return m;
        }
      };

      return str.replace(/[!'()*~]/g, func); // '
    }

    var encoded = [];

    for (var key in params) {
      var val = encode(kvs[key]);
      encoded.push(key + '=' + val);
    }

    return encoded.join('&');
  }, // queryString

  url: function() {
    var base = 'https://' + this.HOST + '/' + this.API_VERSION + '/';
    return base + Array.prototype.join.call(arguments, '/');
  }
}

