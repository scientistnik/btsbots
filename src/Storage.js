import fs from "fs"

class Storage {
  constructor(index) {
    this.index = index
  }

  init(initData) {
    if (fs.readFileSync(this.index, {flag: "a+"}).length == 0)
      fs.writeFileSync(this.index, JSON.stringify(initData, null, 2))
  }

  read() {
    return JSON.parse(fs.readFileSync(this.index))
  }

  write(data) {
    fs.writeFileSync(this.index, JSON.stringify(data,null,2))
  }
}

export default Storage
