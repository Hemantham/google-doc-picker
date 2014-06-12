dependencies ={
    stripConsole: "normal",
    cssOptimize: "comments",

    layers:  [
        {
            name: "../docpicker/docpicker.js",
            dependencies: [
                "docpicker.DocsDialog"
            ]
        },
        {
            name: "../googleDocPicker/googleDocPicker.js",
            dependencies: [
                "googleDocPicker.DocPicker",
            ]
        }
    ],

    prefixes: [
        [ "docpicker",          "../../../../../../public/js/docpicker" ],
        [ "googleDocPicker",    "../../../../../../public/js/googleDocPicker" ],
        [ "dijit",              "../dijit" ],
        [ "dojox",              "../dojox" ],
    ]

};
