import {Registry} from 'rage-edit';

if(process.platform === 'win32') {

    (async () => {
        await Registry.set('HKCU\\Software\\CallMantra\\Capabilities', 'ApplicationName', 'CallMantra');
        await Registry.set('HKCU\\Software\\CallMantra\\Capabilities', 'ApplicationDescription', 'CallMantra');

        await Registry.set('HKCU\\Software\\CallMantra\\Capabilities\\URLAssociations', 'tel', 'CallMantra.tel');

        await Registry.set('HKCU\\Software\\Classes\\CallMantra.tel\\DefaultIcon', '', process.execPath);

        await Registry.set('HKCU\\Software\\Classes\\CallMantra.tel\\shell\\open\\command', '', `"${process.execPath}" "%1"`);

        await Registry.set('HKCU\\Software\\RegisteredApplications', 'CallMantra', 'Software\\CallMantra\\Capabilities');
    })();
}