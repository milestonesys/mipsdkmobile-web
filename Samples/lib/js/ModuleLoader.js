var SDKModuleLoader = function () {
    let modules = [
        '../../Lib/modules/VideoStream/main.js',
        '../../Lib/modules/VideoConnection/main.js'
    ];

    modules.forEach((module) => {
        let script = document.createElement('script');
        script.type = "module";
        script.src = module;
        document.querySelector('head').appendChild(script);
    });
};