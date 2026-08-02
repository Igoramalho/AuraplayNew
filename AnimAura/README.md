# AuraPlay — .NET MAUI para Windows

Aplicativo desktop MAUI recriado a partir do protótipo HTML fornecido.

A janela usa uma moldura personalizada: as bolinhas laranja, verde e vermelha
no cabeçalho controlam minimizar, maximizar/restaurar e fechar.

O espaço central do cabeçalho funciona como área para arrastar a janela. No
player, o botão de tela cheia usa o modo fullscreen nativo do Windows, ocupa o
monitor inteiro e oculta os controles após inatividade. Mova o mouse para os
150 pixels inferiores da tela para exibir novamente a barra do player.

No fullscreen, o cursor e o botão “Voltar ao Início” também são ocultados após
1,8 segundo. Ao voltar para outra tela, o aplicativo encerra primeiro os modos
fullscreen HTML e nativo para manter a navegação clicável.

## Executar em desenvolvimento

```powershell
dotnet build -c Release
dotnet run -c Release
```

## Publicação

O executável publicado fica em `publish\win-x64\AuraPlay.exe`.

Execute o `.exe` mantendo os demais arquivos da pasta ao lado dele. O aplicativo
usa WebView2 (incluído nas versões atuais do Windows) e conexão com a internet
para carregar fontes, imagens e os scripts visuais usados pelo protótipo.
