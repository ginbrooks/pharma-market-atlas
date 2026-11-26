# 数据与素材来源

- **世界银行 World Development Indicators**。六项指标通过世界银行 API 获取并整理为国家与年份序列。`data/snapshot.json` 保留逐项的原始提供方、官方指标链接、日期和许可。包括联合国人口司、世界卫生组织全球卫生支出数据库等来源。已存储的六项指标记录均标为 CC BY 4.0。[WDI](https://databank.worldbank.org/source/world-development-indicators) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **Natural Earth**。国界、主要水系、道路、城镇、港口及地形等使用公有领域的矢量与栅格资料，经抽稀、转投影、中文标注和配色处理。分层来源、原始资料校验值和处理方式见 `data/basemap/manifest.json`。公开仓库所附港口使用 Natural Earth 的 Ports 数据。[资料与使用条件](https://www.naturalearthdata.com/about/terms-of-use/) · [数据版本](https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2)
- **GeoNames**。部分主要城市和小型聚居地的名称与坐标取自 GeoNames，经过筛选、中文定名并与 Natural Earth 的城市资料合并。`data/cartography/country-city-selection.json` 记录来源、编号和选择方法。[GeoNames 数据](https://www.geonames.org/) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **flag-icons**。国旗 SVG 来自 Panayiotis Lipiridis 与项目贡献者，使用 MIT 许可。完整条款及版本保存在 [LICENSE](frontend/public/flags/LICENSE) 和 [NOTICE](frontend/public/flags/NOTICE.md)。[flag-icons](https://github.com/lipis/flag-icons)
- **示例药监网站目录**。机构链接、名称和可查事项以对应注册查询平台或监管机关为来源，入口及资料核对页保存在 `data/profiles.json`。
