# Inventário para Android

Cliente Android conectado a https://count-quick.lovable.app. Requer internet e Android 8.0 ou superior. Não altera a aplicação web nem sua autenticação. As atualizações publicadas no site aparecem no APK.

Inclui navegação de retorno, seleção de arquivos, permissão de câmera e salvamento de PDF. Scanner físico precisa estar configurado como teclado, como no aplicativo web. Compatibilidade de câmera, scanner e downloads deve ser validada no aparelho real antes do uso operacional. OAuth externo não possui retorno nativo configurado; usar o login por e-mail existente.

## Compilação

Executar `bash android-apk/build.sh` com JDK 17 e Android SDK contendo plataforma 35 e build-tools 35.0.0. Definir `ANDROID_HOME`, `JAVA_HOME`, `APK_KEYSTORE` e `APK_PASSWORD_FILE`. A chave de assinatura deve ser mantida fora do código e reutilizada em atualizações; a senha é lida de arquivo privado. Definir `APK_OUTPUT` para o destino, opcionalmente; por padrão `/tmp/apk-build/Inventario.apk`.

O APK usa uma chave local, não uma assinatura de distribuição da Play Store. Guardar a chave e senha para futuras versões. Não inclui funcionamento offline.