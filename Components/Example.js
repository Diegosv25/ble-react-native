import React, { useState, useEffect } from 'react';
import {
    NativeModules,
    NativeEventEmitter,
    ActivityIndicator,
    StyleSheet,
    Text,
    View,
    FlatList,
    TouchableOpacity
} from 'react-native';
import BleManager from 'react-native-ble-manager';
import { Buffer } from 'buffer';
import { checkCRC32, MountFormat, SplitData } from '../Helpers/helper'

const bleManagerEmitter = new NativeEventEmitter(NativeModules.BleManager);
//hashdevice
const _deviceID = /*'HW29C2AE03'*/'HW29C9E006';
// Service AE353366-EAAA-4E29-98CC-AECB33A323ED
const uuidService = "00002760-08C2-11E1-9073-0E8AC72E1011";
// Read Characteristic.
const uuidRead = "00002760-08C2-11E1-9073-0E8AC72E0012";
// Write Characteristic.
const uuidWrite = "00002760-08C2-11E1-9073-0E8AC72E0011";

//let bson = '4900000010616374696F6E000A000000086E6F63686B00010372756E002B0000000568647200040000000000000000056F700004000000004D514D8005736967000100000000AA0000';
let bson = '4C01000010616374696F6E000A000000086E6F63686B00010372756E002E0100000568647200040000000000000000056F700007010000004D419782D800B09C82A500B0C142C0C0C08D4B657973206372656174696F6E42C1C0C0944163636570740A67656E65726174650A6B65797343C0C04C4EC19EC24797828800B042C1C0C09247656E65726174696E670A6B6579732E2E2E43C0C44C4EC1110042C1C0C08E4B6579730A67656E65726174656443C0C195C08E0001950195009682040142C1C0C08F416374696F6E0A72656A656374656443C0C295C69682040142C0C0C08D4B657973206372656174696F6E42C1C0C093416C72656164790A696E697469616C697A656443C0C295C59682040142C0C0C08D4B657973206372656174696F6E42C1C0C090436170747572650A667020666972737443C0C295C44C4D8005736967000100000000AA0000';
let device, cData, cWrite, cRead, index;
let auxData = [], multiPkgData = [], res = '', finalData = [], ack = [], countPackages = 0, countAck = 0;
let errorDataReceived = false, isACK, isData, isMultiPackage;

const Example = () => {
    const [listDevices, setlistDevices] = useState([]);
    const [isConnected, setisConnected] = useState(false);
    const [response, setresponse] = useState(null);

    useEffect(() => {
        BleManager.start({ showAlert: false });
        bleManagerEmitter.addListener('BleManagerDiscoverPeripheral', handleDiscoverPeripheral);
        bleManagerEmitter.addListener('BleManagerDisconnectPeripheral', handleDisconnectedPeripheral);
        bleManagerEmitter.addListener('BleManagerDidUpdateValueForCharacteristic', handleUpdateValueForCharacteristic);

        return (() => {
            console.log('unmount');
            setlistDevices([]);
            handleDisconnectedPeripheral();
            bleManagerEmitter.removeListener('BleManagerDiscoverPeripheral', handleDiscoverPeripheral);
            bleManagerEmitter.removeListener('BleManagerDisconnectPeripheral', handleDisconnectedPeripheral);
            bleManagerEmitter.removeListener('BleManagerDidUpdateValueForCharacteristic', handleUpdateValueForCharacteristic);
        })
    }, []);

    const startScan = () => {
        if (!device) {
            BleManager.scan([], 20, true).then(() => {
                console.log('Scanning...');
            }).catch(err => {
                console.error(error);
            });
        }
    }

    const handleDiscoverPeripheral = async peripheral => {
        if (peripheral.name !== null) {
            setlistDevices(prev => {
                const exists = prev.find(d => d.name === peripheral.name);
                if (!exists) return [...prev, peripheral];
                return prev;
            });
        }
    }

    const onPress = (btn) => {
        if (btn === 'scan') {
            BleManager.enableBluetooth().then(() => {
                console.log("The bluetooth is already enabled or the user confirm");
                if (!device) startScan();
                else connect();
            });
        } else {
            handleDisconnectedPeripheral();
        }
    }

    const onPressConnectDevice = item => {
        const d = listDevices.find(device => device.id === item.id);
        device = item;
        connect();
        BleManager.stopScan();
    }


    const connect = async () => {
        if (device) {
            try {
                await BleManager.connect(device.id)
                console.log("Connected to", device.name)
                setisConnected(true);
                const peripheralInfo = await BleManager.retrieveServices(device.id);
                const characteristics = peripheralInfo.characteristics.filter(c => c.service.toUpperCase() === uuidService);
                cWrite = characteristics.find(c => c.characteristic.toUpperCase() === uuidWrite);
                cRead = characteristics.find(c => c.characteristic.toUpperCase() === uuidRead);
                if (cWrite) {
                    cData = Array.from(Uint8Array.from(Buffer.from(bson, 'hex')));
                    if (cRead) {
                        await BleManager.startNotification(device.id, cRead.service, cRead.characteristic);
                        console.log("Notification started");
                        let sent;
                        if (cData.length > 80) {
                            multiPkgData = cData.slice(0, 80);
                            index = 80;
                            sent = Array.from(Uint8Array.from(MountFormat(multiPkgData, false, true)));
                        } else {
                            sent = Array.from(Uint8Array.from(MountFormat(cData, false, false)))
                        }
                        console.log("Writing on characteristic...");
                        await BleManager.writeWithoutResponse(device.id, cWrite.service, cWrite.characteristic, sent);
                    } else {
                        console.log("Characteristic READ not found");
                    }
                } else {
                    console.log("Characteristic WRITE not found");
                }
            } catch (error) {
                console.log('ERROR --> ', error)
            }
        }
    }

    const handleUpdateValueForCharacteristic = async ({ value }) => {
        if (device) {
            const valueArray = Uint8Array.from(Buffer.from(value, 'hex'));
            if (value[4] === 2 || value[4] !== 3) { // DATA
                isData = true;
                countPackages++;
                finalData.push(...valueArray);
            } else if (value[4] === 3 && !isData) {
                isData = false;
                countAck++;
                const exists = ack.toString(16) === valueArray.toString(16);
                if (!exists) ack = valueArray;
            }
            let aux = isData ? finalData : ack;
            let res = '';
            if (countAck - countPackages === 1 || checkCRC32(aux)) {
                for (let index = 6; index < aux.length - 4; index++) {
                    auxData.push(aux[index]);
                }
            }
            // data type: 1 -> [ERROR] | 2 -> [DATA] | 3 -> [ACK]
            if (aux[4] === 1) { // ERROR
                errorDataReceived = true;
                let data2 = auxData.reverse();
                data2.forEach(element => {
                    var str = element.toString(16);
                    if (str.length === 1) {
                        res += '0' + element.toString(16);
                    } else {
                        res += element.toString(16);
                    }
                });
                updateResponse(res.toUpperCase());
            }
            if (aux[4] === 2) { // DATA
                isData = true;
                isACK = false;
                isMultiPackage = aux[5] === 1;
            }
            if (aux[4] === 3) { // ACK
                if (aux[5] === 1) {
                    isData = false;
                    isACK = true;
                }
            }
            if (!errorDataReceived) {
                try {
                    if (isData) {
                        if (!isMultiPackage && (countAck - countPackages === 1 || checkCRC32(aux))) {
                            updateResponse(ToHexString(auxData));
                        } else {
                            const data = Array.from(Uint8Array.from(MountFormat([0], true, false)));
                            await BleManager.writeWithoutResponse(device.id, cWrite.service, cWrite.characteristic, data);
                        }
                    }
                    else if (isACK) {
                        let sent;
                        if (cData.length - index <= 80) {
                            multiPkgData = cData.slice(index, cData.length);
                            sent = MountFormat(multiPkgData, false, false);
                            //console.log(`${ToHexString(sent)} - ${sent.length}`);
                        } else {
                            multiPkgData = cData.slice(index, index + 80);
                            index += 80;
                            sent = MountFormat(multiPkgData, false, true);
                        }
                        await BleManager.writeWithoutResponse(device.id, cWrite.service, cWrite.characteristic, Array.from(Uint8Array.from(sent)));
                    }
                } catch (error) {
                    console.log('Error at updating: ', error)
                }
            } else {
                stopNotifications();
            }
        } else {
            console.log('No device')
        }

    }

    const updateResponse = data => {
        res = SplitData(Buffer.from(data, 'hex'));
        setresponse(res);
    }

    const ToHexString = data => {
        return Array.prototype.map.call(new Uint8Array(data), x => ('00' + x.toString(16)).slice(-2)).join('').toUpperCase();
    }

    const stopNotifications = async () => {
        try {
            setisConnected(false);
            await BleManager.stopNotification(device.id, cRead.service, cRead.characteristic);
        } catch (error) {
            console.log('Error stopping notifications: ', error.message)
        }
    }

    const handleDisconnectedPeripheral = async () => {
        if (device) {
            await BleManager.disconnect(device.id);
            device = null;
            setisConnected(false);
            console.log('Disconnected')
        }
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>BLE DEVICES</Text>
            {!isConnected
                ? <>
                    {listDevices.length > 0 &&
                        <>
                            <Text>Select the device you want to connect.</Text>
                            <FlatList
                                data={listDevices}
                                renderItem={({ item }) =>
                                    <TouchableOpacity style={styles.listDevices} onPress={() => onPressConnectDevice(item)}>
                                        <Text style={styles.device}>
                                            {item.name}
                                        </Text>
                                    </TouchableOpacity>
                                }
                            />
                        </>
                    }
                    <TouchableOpacity style={styles.btn} onPress={() => onPress('scan')}>
                        <Text style={styles.btnText}>Scan</Text>
                    </TouchableOpacity>
                </>

                : <TouchableOpacity style={styles.btn} onPress={() => onPress('disconnect')}>
                    <Text style={styles.btnText}>Disconnect</Text>
                </TouchableOpacity>
            }

            {response && <Text>Response: {response}</Text>}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        display: 'flex',
        alignItems: "center",
        padding: 20,
    },
    title: {
        textAlign: 'center',
        fontSize: 24,
        marginBottom: 30,
        fontFamily: 'Exo-Medium',

    },
    btn: {
        alignItems: "center",
        backgroundColor: "#DDDDDD",
        padding: 10,
        marginVertical: 15,
        width: '60%',
        backgroundColor: '#6c757d',
        borderRadius: 5
    },
    btnText: {
        fontSize: 16,
        fontFamily: 'Exo-Medium',
        color: '#fff'
    },
    listDevices: {
        alignItems: "center",
        padding: 5,
        marginTop: 10,
        marginBottom: 20
    },
    device: {
        alignItems: "center",
        borderColor: "#DDDDDD",
        borderWidth: 2,
        padding: 8,
        marginVertical: 5,
        color: '#6c757d',
        borderRadius: 5
    }

});

export default Example;