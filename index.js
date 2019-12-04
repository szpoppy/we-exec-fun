let hasOwnProperty = Object.prototype.hasOwnProperty
let toString = Object.prototype.toString
//======================================================================

let msgOpt = {
    before: "已经初始化，请在初始化之前调用",
    after: "还没初始化，请在初始化之后调用"
}
function warn(msg = "before") {
    console.warn(msgOpt[msg] || msg || "")
}

// 插件模式
let pluginArr = []
function doFunOn(fn) {
    pluginArr.push(fn)
}
function doFun(fn, isComponent, initFn) {
    if (initFn === undefined) {
        initFn = isComponent ? Component : Page
    }
    // 一些临时字段，unload会自动清理
    let temp = {}
    let vm

    function $vm() {
        return vm
    }

    function $bind(fn) {
        return function() {
            fn.apply(vm, arguments)
        }
    }

    let options = {}

    let data = (options.data = {})
    function setData(key, callback, ex) {
        let dd = key
        if (typeof key == "string") {
            dd = {}
            dd[key] = callback
            callback = ex
        }

        if (vm) {
            vm.setData(dd, callback)
            return
        }

        for (let n in dd) {
            let da = data
            n.replace(/(\w+)(\]\.?|\.|\[)?/g, function(s0, s1, s2) {
                if (!s2) {
                    da[s1] = dd[n]
                    return ""
                }
                if (s2 != "[") {
                    s2 = "."
                }
                let daTo = da[s1]
                let daType = toString.call(daTo).toLowerCase() == "[object array]" ? "[" : "."
                if (daType != s2) {
                    da[s1] = daType == "[" ? [] : {}
                }
                return ""
            })
        }
    }

    function getData(key) {
        let da = vm ? vm.data : data
        let arr = key.match(/\w+/g) || []
        for (let i = 0; i < arr.length; i += 1) {
            da = da[arr[i]]
            if (da == null) {
                break
            }
        }

        return da
    }

    let methods = {}
    function setMethods(key, fn) {
        if (vm) {
            warn("before")
            return
        }

        if (typeof key == "string") {
            methods[key] = fn
            return $bind(fn)
        }

        let val = {}
        for (let n in key) {
            methods[n] = key[n]
            val[n] = $bind(key[n])
        }
        return val
    }

    function fnToBindVM({ value }) {
        if (typeof value == "function") {
            return $bind(value)
        }
        return value
    }

    function setter({
        // options 属性
        prot,
        format,
        isFreeze,
        isBack = true
    }) {
        let opt = {}

        function setterOn(key, val) {
            if (vm) {
                warn("before")
                return
            }

            if (prot && !options[prot]) {
                options[prot] = opt
            }
            let back = (isBack && {}) || null
            if (typeof key == "string") {
                key = { [key]: val }
            }
            for (let n in key) {
                // console.log(prot, key, n, hasOwnProperty.call(key, n), back, format)
                if (hasOwnProperty.call(key, n)) {
                    opt[n] = key[n]
                    if (back) {
                        if (format) {
                            let bkVal = format({ value: key[n], backData: back, key: n, opt })
                            // console.log(prot, "bkVal", bkVal)
                            if (bkVal !== undefined) {
                                back[n] = bkVal
                            }
                        } else {
                            back[n] = val
                        }
                    }
                }
            }
            if (back && isFreeze) {
                return Object.freeze(back)
            }
            return back
        }

        return {
            data: opt,
            on: setterOn
        }
    }

    function setProt(prot, format) {
        return function(val) {
            if (vm) {
                warn("before")
                return
            }
            options[prot] = val
            return format ? format(val) : val
        }
    }

    function lifecycleExec(fns) {
        return function() {
            for (let i = 0; i < fns.length; i += 1) {
                fns[i].apply(this, arguments)
            }
        }
    }
    function makeLifecycle() {
        let lifecycles = {}

        let back = {
            on(key, fn) {
                if (typeof key == "string") {
                    let lc = lifecycles[key]
                    if (!lc) {
                        lc = lifecycles[key] = []
                    }
                    lc.push(fn)
                    return
                }
                for (let n in key) {
                    back.on(n, key[n])
                }

                return back
            },
            make(opt) {
                if (typeof opt == "string") {
                    let opt = options[opt]
                    if (!opt) {
                        opt = options[opt] = {}
                    }
                }
                for (let n in lifecycles) {
                    opt[n] = lifecycleExec(lifecycles[n])
                }
                return opt
            },
            emit(type, ...args) {
                let fns = lifecycles[type] || []
                for (let i = 0; i < fns.length; i += 1) {
                    fns[i].apply(vm, args)
                }
            },
            currying(key) {
                return fn => back.on(key, fn)
            },
            has() {
                for (let n in lifecycles) {
                    return true
                }
                return false
            }
        }

        return back
    }

    let quickNextArr = []
    function quickNext(key) {
        // let vKey = key.replace(/^\$+/, "")
        return function() {
            let vl = vm
            // if (!vl && Vue && typeof Vue[vKey] == "function") {
            //     key = vKey
            //     vl = Vue
            // }
            if (!vl) {
                quickNextArr.push({
                    key: key,
                    args: arguments
                })
                return
            }
            return vl[key](...arguments)
        }
    }

    // ============================================

    // let unicom = makeLifecycle()
    let lifecycle = makeLifecycle()

    let fnArg = {
        // 参数
        options,
        temp,

        // 参数
        $vm,
        $bind,
        $setData: setData,
        $getData: getData,
        $methods: setMethods
    }
    // clearTimeout
    // clearInterval

    function detached() {
        vm = null
        // 自动清理临时字段中数据
        for (let n in temp) {
            if (n.indexOf("$handleT$") == 0) {
                clearTimeout(temp[n])
            }
            if (n.indexOf("$handleI$") == 0) {
                clearInterval(temp[n])
            }
            temp[n] = undefined
            delete temp[n]
        }
    }

    function attached() {
        vm = this
        while (quickNextArr.length) {
            let toDo = quickNextArr.shift()
            vm[toDo.key](...toDo.args)
        }
    }

    if (isComponent) {
        // 组件特有
        fnArg.$properties = setter({
            prot: "properties",
            isBack: false
        })
        fnArg.$attached = lifecycle.currying("attached")
        fnArg.$ready = lifecycle.currying("ready")
        fnArg.$detached = lifecycle.currying("detached")

        lifecycle.on("attached", attached)
        lifecycle.on("detached", detached)
    } else {
        fnArg.$attached = fnArg.$onLoad = lifecycle.currying("onLoad")
        fnArg.$onShow = lifecycle.currying("onShow")
        fnArg.$onReady = lifecycle.currying("onReady")
        fnArg.$onHide = lifecycle.currying("onHide")
        fnArg.$detached = fnArg.$onUnload = lifecycle.currying("onUnload")
        fnArg.$onPageScroll = lifecycle.currying("onPageScroll")

        lifecycle.on("onLoad", function(query) {
            temp.query = query
            attached.call(this)
        })
        lifecycle.on("onUnload", detached)
    }

    let afterArr = []

    pluginArr.forEach(function(pluginFn) {
        pluginFn({
            after: function(afterFn) {
                afterArr.push(afterFn)
            },
            attached(fn) {
                lifecycle.on((isComponent && "attached") || "onLoad", fn)
            },
            detached(fn) {
                lifecycle.on((isComponent && "detached") || "onUnload", fn)
            },
            fnArg,
            lifecycle,
            makeLifecycle,
            quickNext,
            setter,
            fnToBindVM,
            setProt,
            isComponent
        })
    })

    fn(fnArg)

    afterArr.forEach(function(afterFn) {
        afterFn(fnArg)
    })

    lifecycle.make(options)

    if (isComponent) {
        options.methods = methods
    } else {
        Object.assign(options, methods)
    }

    initFn && initFn(options)

    return options
}

doFun.on = doFunOn
doFun.default = doFun

module.exports = doFun
